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

// A slot is offered to a set of kinds; a single *option* inside one is
// sometimes narrower than its slot, and then it carries its own test. Both
// answer the same question – would clicking this produce anything but the
// compiler's refusal – and the answer is read off the compiler's own rules
// rather than restated as a list of names.
const dgeShapeOK = (el) => el.kind === 'box';
const dgeElbowOK = (el) => !(el.via || []).length;

// Which pair of alignment words can pick a side of an edge, which is a
// question about the *routed* line rather than about the statement: the
// compiler offsets the label along the line's normal, so `.top` / `.bottom`
// act across a mostly horizontal edge and `.left` / `.right` across a mostly
// vertical one. The other pair runs along the line, moves nothing, and comes
// back as a build warning – which is the click this panel exists not to offer.
// Read off the painted polyline, the same source dgeEdgePts reads, and at the
// same point dgPolyPoint puts the label.
//
// Null where there is no line to ask, and both pairs are then offered rather
// than neither: a control that is missing reads as "this element cannot do
// that", which would be the wrong answer to "the drawing is not up yet".
function dgeEdgeVertical(el) {
  if (!el || el.kind !== 'edge') return null;
  const pts = dgeEdgePts(el.id);
  if (!pts || pts.length < 2) return null;
  const { dir } = window.PSI_DG.dgPolyPoint(pts, 0.5);
  return Math.abs(dir[1]) > Math.abs(dir[0]);
}
// A row is offered where its pair can act – and also where the line already
// says one of them, whether it can act or not. A word written on an edge it
// cannot move is still written on it, and a row that hid itself would leave the
// author no way to take it off, which is a worse answer than the pressed swatch
// with the compiler's warning beside it.
const dgeCarries = (el, pair) => (el.classes || []).some((c) => pair.includes(c));
const dgeAcrossOK = (el) => el.kind !== 'edge' || dgeEdgeVertical(el) !== false
  || dgeCarries(el, ['left', 'right']);
const dgeDownOK = (el) => el.kind !== 'edge' || dgeEdgeVertical(el) !== true
  || dgeCarries(el, ['top', 'bottom']);

// Which of the two "how a line is drawn" classes is in force. `el.classes` is
// only what the line itself says, and a `default edge {.elbow}` binds just as
// hard – a control that read the line alone would offer a gesture the compiler
// then refuses. Most specific first, the order dgeResolve walks the same
// layers in.
function dgeCurveOf(el) {
  const pick = (cls) => (cls || []).find((c) => c === 'smooth' || c === 'elbow') || '';
  const own = pick(el.classes);
  if (own) return own;
  for (const layer of [...window.PSI_DG.dgDefaultLayers(DGE.model, el.kind, el.tags)].reverse()) {
    const c = pick(layer.classes);
    if (c) return c;
  }
  return '';
}

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
  // One slot, seven outlines, because they are one slot in the grammar: a
  // hexagon has no corner radius to argue about, so picking one has to
  // displace whatever was there. Only the two rectangles reach a container:
  // `rejectShapeOn` refuses every other outline on anything but a box, so
  // offering one there would be a click that can only come back as a
  // refusal – which is the rule the two alignment rows already follow.
  { key: 'corner', label: 'outline', kinds: ['box', 'container'],
    // Which way a chevron or a wedge aims is the `point` option rather than a
    // class, and it has its own row – see dgeAimOf. The outline is picked
    // here, the direction there, because one is a slot and the other is a
    // word on the line.
    options: [{ cls: '', label: 'default' }, { cls: 'round' }, { cls: 'sharp' },
      { cls: 'hex', when: dgeShapeOK }, { cls: 'diamond', label: 'diam', when: dgeShapeOK },
      { cls: 'chevron', label: 'chev', when: dgeShapeOK },
      { cls: 'wedge', when: dgeShapeOK }, { cls: 'cross', when: dgeShapeOK }] },
  { key: 'reading', label: 'reading', kinds: ['box', 'text'],
    options: [{ cls: '', label: 'across' }, { cls: 'turn', label: 'up' }] },
  // One slot, "how a line is drawn": the waypoints as segments, as a spline
  // through them, or as a rail halfway across the gap. `.elbow` writes its own
  // two waypoints, so the compiler refuses an edge that also carries `via`
  // rather than silently preferring one – an edge already bent by hand is
  // therefore not offered it.
  { key: 'curve', label: 'line shape', kinds: ['edge'],
    options: [{ cls: '', label: 'straight' }, { cls: 'smooth', label: 'curved' },
      { cls: 'elbow', when: dgeElbowOK }] },
  // Drawing order is otherwise fixed. Right for an arrow, which a box should
  // cover where it arrives; wrong for an axis, which showed only in the gaps
  // between the columns it ruled.
  { key: 'depth', label: 'depth', kinds: ['edge'],
    options: [{ cls: '', label: 'behind boxes' }, { cls: 'front', label: 'in front' }] },
  { key: 'size', label: 'type size', kinds: null,
    options: [{ cls: 'small' }, { cls: '', label: 'normal' }, { cls: 'large' }] },
  { key: 'family', label: 'family', kinds: null,
    options: [{ cls: '', label: 'sans' }, { cls: 'mono' }, { cls: 'serif' }, { cls: 'hand' }] },
  { key: 'fitting', label: 'type fits the box', kinds: ['box', 'text'],
    options: [{ cls: '', label: 'no' }, { cls: 'fit' }, { cls: 'shrink' }] },
  { key: 'weightfont', label: 'text weight', kinds: null,
    options: [{ cls: '', label: 'regular' }, { cls: 'bold' }] },
  // Both axes, and on a box as well as a free text: a tall element with a
  // short label is the case these words exist for. Measured against the
  // element's own padding, so `left` is as far left as that box allows.
  // The kinds are exactly the ones the compiler lets the word act on. A `dot`
  // has a label and takes both. A container's caption and a brace's label are
  // pinned by their own statement, so neither row offers them and the compiler
  // refuses both.
  //
  // An edge takes all four, and they mean something else there: which side of
  // the line the label sits on. Only the pair lying *across* the routed line
  // can pick a side, so each row asks the drawing which edges it applies to –
  // and a row left with nothing but its own "none of this" swatch is dropped
  // in dgeRenderSide rather than offered as a choice of one.
  { key: 'align', label: 'label across', kinds: ['box', 'dot', 'text', 'edge'],
    options: [{ cls: 'left', when: dgeAcrossOK }, { cls: '', label: 'centre' },
      { cls: 'right', when: dgeAcrossOK }] },
  { key: 'alignv', label: 'label down', kinds: ['box', 'dot', 'text', 'edge'],
    options: [{ cls: 'top', when: dgeDownOK }, { cls: '', label: 'middle' },
      { cls: 'bottom', when: dgeDownOK }] },
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
// What the element's own *statement* accepts, which is not always what its
// kind accepts. A `bars`, `grid`, `plot`, `table` or `lanes` frame is a box as
// far as the layout is concerned, but the line that wrote it is not a `box`
// line: offering `pad` there would write a word that statement refuses, and
// `space` or `col` would never be offered at all.
function dgeKindOpts(elOrKind) {
  const el = typeof elOrKind === 'string' ? null : elOrKind;
  // `entry` for the same reason `frame` is here: a sequence's `actor`, `note`
  // and message lines are statements of their own, and the box and the edge
  // they expand into take w / h / pad, which those lines refuse. Offering a
  // control whose only outcome is a compiler refusal is not offering a
  // control.
  const key = el ? (el.frame || el.entry || el.kind) : elOrKind;
  return (window.PSI_DG.DG_KIND_OPTS[key] || []).slice();
}

// Which way a pointed outline aims. Its own control rather than a text field
// in the size row: the value is one of four words, and the row above it that
// picks the outline is exactly the same shape.
function dgeAimOf(el) {
  if (!el) return null;
  const cls = new Set(el.classes || []);
  for (const layer of window.PSI_DG.dgDefaultLayers(DGE.model, el.kind, el.tags)) {
    for (const c of layer.classes) if (window.PSI_DG.DG_SHAPE_CLASSES.has(c)) cls.add(c);
  }
  const kind = window.PSI_DG.dgShapeOf(cls);
  return window.PSI_DG.DG_POINTED.has(kind) ? kind : null;
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
  // Shown *before* the figure is fitted: every measurement fit needs –
  // the canvas box, the frame box – is zero while the overlay is hidden, so
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
    // broken, so this should always equal DGE.source – and if some path ever
    // gets round that, a gesture planned against the stale table would splice
    // at offsets that have moved. Cheaper to notice than to debug.
    DGE.spansFor = DGE.source;
    DGE.beat = Math.max(0, Math.min(res.model.steps.length, DGE.beat));
    DGE.boxes = dgeBoxesAt(res.model, DGE.beat);
    dgePaintArt(res.html);
    // A selection whose element the author just deleted by typing has to go.
    // `dgeSynthOwner` is the third question and not a redundant one: a
    // `bars … series of X` draws no frame, so its name is in no box map and
    // answers to no dgeFind – and without it a click on one of its columns
    // selected the statement at pointerdown and lost it again at the recompile
    // pointerup runs, which looked exactly like a click that did nothing.
    DGE.selection = DGE.selection.filter((id) =>
      DGE.boxes.has(id) || dgeFind(id) || dgeSynthOwner(id));
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
      // Kept, not discarded. dgStateAt answers what the ops say; only these
      // frames carry the *resolved* visibility, after an edge has followed its
      // ends and a container its members. The step pane needs both, and the
      // JSON is parsed here either way.
      DGE.frames = data.frames || null;
      window.dgRenderInto(svg, { data, svg }, DGE.beat);
    } catch (e) { DGE.frames = null; /* a diagram with no steps has no payload */ }
  } else {
    DGE.frames = null;
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
    // Asked by kind, not by whether a box happens to exist. layoutDiagram
    // records a bounding box for an edge too – that is what makes `w1.cy` the
    // height of a horizontal wire – and reading the absence of one as "this
    // is a line" silently turned every arrow's outline back into a rectangle
    // the day those boxes arrived.
    const el = dgeFind(id);
    if (el && el.kind === 'edge') {
      const pts = dgeEdgePts(id);
      if (pts) {
        g.appendChild(dgeEl('polyline', {
          class: 'dge-sel-path', points: pts.map((q) => q.join(',')).join(' '),
        }));
      }
      continue;
    }
    const b = DGE.boxes.get(id);
    if (b) {
      g.appendChild(dgeEl('rect', {
        class: 'dge-sel', x: b.x - 3, y: b.y - 3, width: b.w + 6, height: b.h + 6, rx: 3,
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
//
// Every grip is measured in screen pixels and drawn in diagram units, the way
// dgeDockAt already sizes its chips. Written as a constant in diagram units
// they grew and shrank with the zoom, which is the one thing a control must
// not do: at 4x a waypoint square covered a quarter of the figure, and at the
// fit zoom of a wide diagram it was a speck.
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
    //
    // Not on an elbow. `.elbow` writes those two waypoints itself and the
    // compiler refuses an edge that also carries `via` rather than preferring
    // one silently, so on an elbow the dot is a control that can only ever
    // come back as that refusal – and there are three of them, because the
    // rail is drawn as three segments.
    if (dgeCurveOf(el) !== 'elbow') for (let i = 0; i + 1 < pts.length; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.appendChild(dgeEl('circle', {
        class: 'dge-handle dge-h-add', 'data-handle': 'add-' + i, 'data-id': id,
        cx: mx, cy: my, r: dgeGrabTolerance(3.5),
      }));
    }
    for (let k = 0; k < via.length && k + 1 < pts.length - 1; k++) {
      const p = pts[k + 1], r = dgeGrabTolerance(4.5);
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
        cx: p[0], cy: p[1], r: dgeGrabTolerance(5),
      }));
    }
    return;
  }
  const b = DGE.boxes.get(id);
  if (!b || !DGE.model.nodes.some((n) => n.id === id)) return;
  if (el.kind === 'image' || el.kind === 'dot' || el.kind === 'box' || el.kind === 'text') {
    const r = dgeGrabTolerance(4.5);
    // A grip is centred on the edge it resizes, so it always covers a square
    // of the element's own interior. On anything only a few grips across that
    // square *is* the element: every pointerdown lands on a handle, and a small
    // dot – a point on a plot, most of all – could not be moved at all, only
    // resized. Below that size the handles are left off and the panel's own `r`
    // or `w` field is the way to resize it; zooming in brings them back, since
    // they are measured on screen.
    if (b.w < r * 5 || b.h < r * 5) return;
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

// The record behind an id that names a *statement* rather than an element.
// `dgeFind` deliberately does not answer for one, and must not start to: a
// `bars … series of X` draws columns in a frame it does not own, so anything
// that took it for an element would offer it a box to drag, a size to pull
// and a placement to write, and every one of those is a word its statement
// refuses. But its line is a line like any other, and everything that reads
// or rewrites *tokens* – the class tail, the tags, a keyword option – has to
// reach it, or the one statement in the grammar with no element of its own
// stays the one statement with no controls.
function dgeLineOwner(id, model) {
  const m = model || DGE.model;
  if (!m) return null;
  return dgeFind(id, m) || (m.statements || []).find((s) => s.id === id) || null;
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
// The distance a freshly docked element keeps when it had none of its own.
const DGE_DOCK_GAP = 0.4;
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
  // The dominant axis decides, measured from centre to centre – the same
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

// `roc@0.35` is a coordinate in a plot's own units, and it is the one
// construct in the grammar the model no longer remembers: dgResolvePlotCoords
// turns it into an ordinary `roc.left + n` in grid cells before layout runs,
// precisely so nothing downstream learns that plots exist. A drag therefore
// planned a nudge, spanOf found no nudge token in `roc@0.35` to rewrite, the
// edit was dropped – and the status bar said "keeps roc.left" over a source
// that had not changed. Silent, and reported as a success.
//
// The scale is still readable, because it is written on the plot's own line:
// the domain is its `x` / `y` option (0,1 when absent, as the compiler
// defaults it) and the size is the `w` / `h` the frame carries. So the delta
// goes back through that scale and the *value* is what gets rewritten, which
// is the token the author would have edited by hand.
const DGE_PLOT_RE = /^([A-Za-z_][\w-]*)@(-?\d*\.?\d+)$/;

// The scale a plot writes its own values in: the domain off its `x` / `y`
// option (0,1 when absent, as the compiler defaults it) and the size off the
// `w` / `h` the frame carries. One reader, because three gestures need it.
function dgePlotScale(ctx, name, axis) {
  const plot = dgeFind(name, ctx.model);
  if (!plot || plot.frame !== 'plot') return null;
  const range = dgeSpanIn(ctx, plot.id, axis);
  const parts = range && range.present ? String(range.value).split(',').map(Number) : [0, 1];
  const [lo, hi] = parts.length === 2 && parts.every(Number.isFinite) ? parts : [0, 1];
  const size = axis === 'x' ? plot.w : plot.h;
  if (!size || hi === lo) return null;
  const step = (hi - lo) / 100;
  return { plot, lo, hi, size, step,
    places: Math.min(6, Math.max(2, Math.ceil(-Math.log10(Math.abs(step))))) };
}

function dgePlotCoordEdit(ctx, id, attr, axis, delta, free) {
  const sp = dgeSpanIn(ctx, id, attr);
  const m = sp && sp.present && DGE_PLOT_RE.exec(sp.text);
  if (!m) return null;
  const sc = dgePlotScale(ctx, m[1], axis);
  if (!sc) return null;
  // Down the page is up the axis, which is the one place a plot is not simply
  // a box with lines in it – and the reason the resolver writes the y nudge
  // negative.
  const raw = Number(m[2]) + (axis === 'x' ? delta : -delta) * (sc.hi - sc.lo) / sc.size;
  const next = free ? raw : dgeRound(raw, sc.step);
  return {
    attr,
    value: `${sc.plot.id}@${dgeNum(next, sc.places)}`,
    why: `keeps it in ${sc.plot.id}'s own units`,
  };
}

// A point on the paper, read back in a plot's own units. The counterpart to
// the edit above, for the one gesture that writes a coordinate from scratch
// rather than nudging one: an endpoint dropped on empty paper. Without it an
// endpoint written `roc@0,roc@0` came back as grid cells – legal, and a silent
// change of units inside the plot the author was working in.
function dgePlotValueAt(ctx, name, axis, px) {
  const sc = dgePlotScale(ctx, name, axis);
  const b = sc && ctx.boxes.get(sc.plot.id);
  if (!sc || !b || !b.w || !b.h) return null;
  const t = axis === 'x' ? (px - b.x) / b.w : (b.y + b.h - px) / b.h;
  return `${sc.plot.id}@${dgeNum(dgeRound(sc.lo + t * (sc.hi - sc.lo), sc.step), sc.places)}`;
}

// ── neighbour guides (editor.md §9.2) ───────────────────────────────
// Snapping in a drawing tool aligns pixels. Here it does something better,
// because **every snap target corresponds to a statement the grammar can
// write** – so a guide is drawn if, and only if, the editor can name the
// line it would produce. A guide the author cannot connect to a line of
// source is decoration, and in this grammar the relation is the whole point.
//
// Four of them, in the order §9.2 ranks them:
//
//   another element's centre or edge line  ->  at m0.cx,…   a ref coordinate
//   the same gap a sibling already has     ->  that number, exactly
//   the line joining two elements          ->  between a,b, and along it frac
//   equal spacing across three or more     ->  spread x | spread y
//
// The first is the row §9.2 calls the one that matters most: **nobody types
// `at c1.cx,m0.cy` from a standing start**, so the guide is not decoration on
// top of that construct, it is the only interface it has.
//
// All four hold to the same rule as the rest of the editor: the snap has to
// survive as a *relation*, never as the number it happens to resolve to
// today. Landing on m0's centre line writes `at m0.cx`, and the next drag
// rewrites the nudge beside it (§9.3) rather than the reference.

// How close a drag has to come, in cells, before a neighbour guide claims
// it. Wider than DGE_ALIGN_TOL, and deliberately: that one aims at the three
// edges of the one element the placement already names, with the pointer
// sitting on top of them. These aim at every line in the figure, from across
// the drawing.
const DGE_GUIDE_CELL = 0.12;
// Equal spacing is held to a third of that, because it is the one candidate
// that writes a *statement* rather than a token: a `spread` makes the element
// a follower, and the strain guide is what the next drag on it will meet.
// That has to be aimed at, not stumbled into – the same bar the docking chips
// clear by making the release itself the commitment.
const DGE_SPREAD_CELL = 0.04;
// An axis this drag has barely touched is not part of it. Without the dead
// zone a pure vertical drag rewrites the x coordinate too, because the
// element happened to be standing on somebody's centre line all along – a
// relation written for a line nobody was aiming at.
const DGE_GUIDE_DEAD = 0.02;
// How far along a joining line a `between` will admit. An element dropped on
// top of one of the two ends is not halfway between them, and
// `between a,b frac 0.02` is a worse way of writing `at a.cx,a.cy`.
const DGE_FRAC_MIN = 0.15;

// Priority, and the reason for it. **A guide is ranked by how much of the
// drag it explains, then by how little source it rewrites.** The winner is
// applied first and claims the axes it moves; anything below it that would
// move a claimed axis is dropped. So two candidates can never argue over one
// pointer position, and two that move different axes can both act – which is
// exactly how `at c1.cx,m0.cy`, two elements and one statement, comes about.
//
//   1  at A.p,B.q   both axes, one token each – §9.2's row that matters most
//   2  between a,b  both axes, one expression
//   3  at A.p,<n>   one axis, and the other stays a bare number
//   4  gap 0.62     one axis, and a number another statement already carries
//   5  spread x     one axis, and a new statement to hold it
//   6  align middle the alignment word on a relation's cross axis (already here)
//   7  the 0.05 cell grid                                         (already here)
//
// Ranks 1 and 3 are the same family split by how much of the drag they
// answer, and that split settles the one genuine argument: a ref coordinate
// on both axes is a complete answer and `between` is not better than it,
// while a ref coordinate on one axis leaves the other a bare number – and
// `between`, which names two elements and fixes both, is. A ref coordinate
// beats the grid outright: a number that happens to be round says nothing
// about the figure, and `m0.cx` survives every later edit to m0.
const DGE_RANK = { atBoth: 1, between: 2, atOne: 3, gap: 4, spread: 5 };

// The lines the grammar can name on a box, which is exactly DG_SCALAR_X and
// DG_SCALAR_Y. The feature of the *dragged* element that lands on one is its
// centre, because that is where `at X,Y` puts it. "Left edges flush" is
// deliberately not in this list: it would be `at m0.left+<half my width>`,
// and that number stops meaning anything the moment either box is resized –
// which is the difference between this and a drawing tool's smart guides.
const DGE_GUIDE_PROPS = { x: ['cx', 'left', 'right'], y: ['cy', 'top', 'bottom'] };
const DGE_PROP_WORD = {
  cx: 'centre line', left: 'left edge', right: 'right edge',
  cy: 'middle', top: 'top edge', bottom: 'bottom edge',
};
const dgeLineAt = (b, axis, prop) => (axis === 'x'
  ? (prop === 'left' ? b.x : prop === 'right' ? b.x + b.w : b.x + b.w / 2)
  : (prop === 'top' ? b.y : prop === 'bottom' ? b.y + b.h : b.y + b.h / 2));

// Everything whose position is computed from `id`, directly or through a
// chain – the elements a guide must not name, because `at <that>.cx` closes
// the loop and the compiler answers `placement cycle: …` after the guide has
// spent the whole drag promising otherwise. dgeDockAt refuses a host for the
// same reason and walks it once per candidate; here the question is asked n
// times a frame, so it is answered once, backwards, for the whole gesture.
function dgeDependents(model, id, eff) {
  const from = new Map();   // what an element is computed from -> who computes from it
  const note = (dep, who) => {
    if (!dep || !who) return;
    if (!from.has(dep)) from.set(dep, []);
    from.get(dep).push(who);
  };
  const placeRefs = (p) => (!p ? []
    : p.kind === 'rel' ? [p.ref]
      : p.kind === 'between' ? (p.refs || []).map((r) => r.ref)
        : p.kind === 'abs' ? (p.at || []).filter((c) => c && c.ref).map((c) => c.ref) : []);
  for (const n of model.nodes) {
    // At a beat it is the placement *in force* that makes the dependency, not
    // the one on the line: an earlier step's `move … to` re-places an element
    // against something else entirely, and a guide that named this element
    // would then close a loop the base model knows nothing about.
    const st = eff && eff.get(n.id);
    for (const r of placeRefs(st ? st.place : n.place)) note(r, n.id);
    if (n.sameAs) note(n.sameAs, n.id);
  }
  // A container or a brace fits its members, so it moves when they do.
  for (const c of [...model.containers, ...model.braces]) {
    for (const m of c.members || []) note(m, c.id);
  }
  // align and spread are dependency edges plus a coordinate override: the
  // master, or the two anchors, is what the followers are computed from.
  for (const a of model.aligns) for (const m of a.members.slice(1)) note(a.members[0], m);
  for (const s of model.spreads) {
    const ends = [s.members[0], s.members[s.members.length - 1]];
    for (const m of s.members.slice(1, -1)) for (const e of ends) note(e, m);
  }
  const out = new Set();
  const queue = [id];
  while (queue.length) {
    for (const who of from.get(queue.pop()) || []) {
      if (out.has(who)) continue;
      out.add(who);
      queue.push(who);
    }
  }
  return out;
}

// The elements a guide may name, resolved once for the whole gesture: the
// model and the layout are both fixed at pointerdown, so the answer cannot
// change under the drag. Synthetic elements are out for the reason dgeHitTest
// and dgeDockAt leave them out – a `bars`, `grid` or `plot` expands into names
// no line of the source declares, and `at g-2-1.cx` is a reference to a name
// that stops existing the moment somebody edits the data.
function dgeGuideHosts(ctx, id, eff) {
  if (ctx.hostsFor === id) return ctx.hosts;
  const dep = dgeDependents(ctx.model, id, eff);
  const out = [];
  for (const [hid, b] of ctx.boxes) {
    if (hid === id || dep.has(hid)) continue;
    const el = dgeFind(hid, ctx.model);
    if (!el || (el.synth && el.synth !== el.id)) continue;
    // An edge is a legal host now - `at w1.cy` is what puts a note on a wire -
    // but only one the author named. An anonymous edge's `edge-3` is
    // positional: insert an edge above it and the name moves to a different
    // line, taking anything placed against it somewhere else without a word.
    // Proposing that in a guide would be the editor writing a reference it
    // knows is unstable, so the guide waits for an {#id}.
    if (el.kind === 'edge' && !el.named) continue;
    out.push({ id: hid, b, node: ctx.model.nodes.some((n) => n.id === hid) });
  }
  ctx.hostsFor = id;
  ctx.hosts = out;
  return out;
}

// The gaps other statements in this block already carry, on the axis this
// placement's own direction runs along. **Only gaps the author actually
// wrote:** every `rel` placement carries one, so counting the default 0.25
// would have every figure offering the same number and meaning nothing by it.
// Cached per gesture, because it is a tokenize per candidate line and the
// lines do not change while the pointer is down.
function dgeSiblingGaps(ctx, id, axis) {
  if (ctx.gapsFor !== id) { ctx.gapsFor = id; ctx.gaps = new Map(); }
  if (ctx.gaps.has(axis)) return ctx.gaps.get(axis);
  const me = dgeFind(id, ctx.model);
  const myRef = me && me.place && me.place.kind === 'rel' ? me.place.ref : null;
  const out = [];
  for (const n of ctx.model.nodes) {
    if (n.id === id || (n.synth && n.synth !== n.id)) continue;
    const p = n.place;
    if (!p || p.kind !== 'rel') continue;
    if (((p.dir === 'right' || p.dir === 'left') ? 'x' : 'y') !== axis) continue;
    const sp = ctx.spans.spanOf(n.id, 'gap');
    if (!sp || !sp.present) continue;
    const g = Number(sp.value);
    if (!Number.isFinite(g) || g < 0) continue;
    // A sibling proper – measured from the same element, or from this one, or
    // this one from it – is the chain §9.2 means by "so a column stays
    // regular", and comes first. Anything else on the same axis is still a
    // number the author chose, and still worth offering behind it.
    out.push({ gap: g, from: n.id, near: p.ref === myRef || p.ref === id || n.id === myRef });
  }
  ctx.gaps.set(axis, out);
  return out;
}

// Pairs of elements whose joining line is worth proposing. Not every pair:
// there are n²/2 of those, a drag would have to measure all of them on every
// pointermove, and most of them join two things the figure never related to
// each other. The pairs that mean something are the ones the figure has
// already written down – the two ends of an arrow, the two anchors of a
// `spread` or an `align`, and the two ends of one link in a `right of`
// chain – and there are O(n) of those.
function dgeGuidePairs(ctx) {
  if (ctx.pairs) return ctx.pairs;
  const seen = new Set();
  const out = [];
  const add = (a, z) => {
    if (!a || !z || a === z) return;
    const key = a < z ? a + ' ' + z : z + ' ' + a;
    if (seen.has(key)) return;
    seen.add(key);
    out.push([a, z]);
  };
  for (const e of ctx.model.edges) {
    if (e.synth && e.synth !== e.id) continue;
    if (e.from && !e.from.point && e.to && !e.to.point) add(e.from.ref, e.to.ref);
  }
  for (const a of ctx.model.aligns) add(a.members[0], a.members[a.members.length - 1]);
  for (const s of ctx.model.spreads) add(s.members[0], s.members[s.members.length - 1]);
  for (const n of ctx.model.nodes) {
    if (n.synth && n.synth !== n.id) continue;
    if (n.place && n.place.kind === 'rel') add(n.id, n.place.ref);
  }
  ctx.pairs = out;
  return out;
}

// Where a new statement goes: the same place dgeAppendLine puts one, which is
// in front of the first `step`. A statement written after a step is still
// read, but the block then says "and by the way" once it has finished
// describing the picture, and nobody writes it that way by hand.
function dgeAppendSplice(src, line) {
  const lines = src.split('\n');
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^\s*step\b/.test(lines[i])) at = i;
  if (at < 0) return [src.length, (src.endsWith('\n') ? '' : '\n') + line];
  let off = 0;
  for (let i = 0; i < at; i++) off += lines[i].length + 1;
  return [off, line + '\n'];
}

// Which axes of an `at` are written in a plot's own units. `roc@0.35` is a
// relation the model no longer remembers – dgResolvePlotCoords spends it into
// an ordinary `roc.left+n` before layout runs – and it is a *better* relation
// than anything here can propose, because it names a value in the data rather
// than a position on the paper. dgePlotCoordEdit already carries it through a
// drag; the guides stay out of its way rather than writing `between a,b` or
// `roc.left` over the top of it. Per axis, because half a placement can be
// plotted and half of it ordinary. Cached per gesture: it is two tokenizes and
// the answer cannot change while the pointer is down.
function dgePlotted(ctx, id) {
  if (ctx.plottedFor === id) return ctx.plotted;
  const test = (axis) => {
    const sp = ctx.spans.spanOf(id, 'at.' + axis);
    return !!(sp && sp.present && DGE_PLOT_RE.test(sp.text));
  };
  ctx.plottedFor = id;
  ctx.plotted = { x: test('x'), y: test('y') };
  return ctx.plotted;
}

// The placement actually in force at the beat on screen, and the `move … by`
// shift that has piled up in front of it. At beat 0 both are what the
// element's own line says; at a beat an earlier step may have re-placed it
// with `move … to`, and the guides have to reason about the picture the
// author is looking at rather than about the opening one. Cached per gesture:
// the beat cannot change while the pointer is down.
function dgeEffState(ctx, el, beat) {
  const id = el.id;
  if (ctx.effFor !== beat) {
    ctx.effFor = beat;
    ctx.eff = beat > 0
      ? window.PSI_DG.dgStateAt(ctx.model, Math.min(ctx.model.steps.length, beat))
      : null;
  }
  const st = ctx.eff && ctx.eff.get(id);
  return {
    place: st ? st.place : el.place,
    shift: st ? st.shift : [0, 0],
    // Whether the placement in force is still the element's own – which is
    // what says the source tokens on that line describe it.
    own: !st || st.place === el.place,
  };
}

// Everything a drag lights up, resolved to the one or two candidates that
// actually get applied. Returns the adjusted delta – so the drawing and the
// plan agree about where the element ends up – the snap dgePlanDrag has to
// honour, and the guide nodes.
//
// `opts.beat` is the one thing that changes what may be offered, and it
// changes two things only: a `spread` is a lecture-wide statement with no
// step form, so it cannot be written into a beat without moving the opening
// picture; and a candidate whose axis is held by an `align` or a `spread` is
// dropped, because a step's `move … to` sets the *placement* and the set
// overrides it, where a `move … by` lands after the override and always
// works. Which guides an element offers is otherwise the same at every beat –
// that is the whole point: an author must not have to know which beat they
// are on to know whether the editor will help them.
function dgeGuideSnap(ctx, id, dx, dy, opts) {
  const none = { dx, dy, snap: null, nodes: [] };
  // Ctrl/Cmd suspends these exactly as it suspends the grid, for the case
  // where the author means 0.5847 and no relation at all.
  if (opts && opts.free) return none;
  const el = dgeFind(id, ctx.model);
  const b = ctx.boxes.get(id);
  // One placement expression, so one element. A marquee is several, and four
  // of them would each want a different line written.
  if (!el || !b || !ctx.model.nodes.some((n) => n.id === id)) return none;
  const beat = (opts && opts.beat) || 0;
  const { uw, uh } = dgeUnits(ctx.model);
  const unit = { x: uw, y: uh };
  const live = { x: Math.abs(dx) > DGE_GUIDE_DEAD, y: Math.abs(dy) > DGE_GUIDE_DEAD };
  if (!live.x && !live.y) return none;
  const want = { x: b.x + b.w / 2 + dx * uw, y: b.y + b.h / 2 + dy * uh };
  const eff = dgeEffState(ctx, el, beat);
  const place = eff.place;
  // A `between` element is already at a relation and its own drag rewrites
  // `frac`; the two proposals below are for an element that has none to lose.
  const bare = !place || place.implicit || place.kind === 'abs';
  // A plot value is read off the tokens on the element's own line, so it can
  // only be answered for where that line is still what places it.
  const plotted = (place && place.kind === 'abs' && eff.own)
    ? dgePlotted(ctx, id) : { x: false, y: false };
  const cands = [];

  // ── another element's centre or edge line -> a ref coordinate ──
  const at = { x: null, y: null };
  if (bare) {
    const parts = (place && place.at) || [];
    for (const axis of ['x', 'y']) {
      if (!live[axis] || plotted[axis]) continue;
      const c = parts[axis === 'x' ? 0 : 1];
      if (c && c.ref) {
        // Already a reference. §9.3: rewrite the nudge, never the reference –
        // so the only line worth lighting up is the one it already follows,
        // and the snap is that nudge coming back to nothing.
        const hb = ctx.boxes.get(c.ref);
        if (!hb) continue;
        const line = dgeLineAt(hb, axis, c.prop);
        const d = Math.abs(line - want[axis]);
        if (d > DGE_GUIDE_CELL * unit[axis]) continue;
        at[axis] = { axis, host: c.ref, prop: c.prop, line, dist: d, held: true };
      } else {
        let best = null;
        for (const h of dgeGuideHosts(ctx, id, ctx.eff)) {
          for (const prop of DGE_GUIDE_PROPS[axis]) {
            const line = dgeLineAt(h.b, axis, prop);
            const d = Math.abs(line - want[axis]);
            if (d > DGE_GUIDE_CELL * unit[axis]) continue;
            // Nearest wins; the centre line wins a tie, because it is the one
            // an author means when two of them fall together.
            const better = !best || d < best.dist - 1e-6
              || (d < best.dist + 1e-6 && prop === DGE_GUIDE_PROPS[axis][0]);
            if (better) best = { axis, host: h.id, prop, line, dist: d, held: false };
          }
        }
        at[axis] = best;
      }
    }
  }
  if (at.x && at.y) {
    cands.push({ kind: 'at', rank: DGE_RANK.atBoth, dist: at.x.dist + at.y.dist,
      axes: ['x', 'y'], parts: [at.x, at.y] });
  } else if (at.x || at.y) {
    const one = at.x || at.y;
    cands.push({ kind: 'at', rank: DGE_RANK.atOne, dist: one.dist, axes: [one.axis], parts: [one] });
  }

  // ── the line joining two elements -> between a,b, and along it frac ──
  // Offered only where the element has no relation to lose. An element
  // written `at x,y` says nothing about what holds it, so proposing one costs
  // nothing; one written `right of a` already says it, and swapping that out
  // from a drop position is the "large semantic change made on a guess" §9.3
  // declines – which *kind* of placement an element has is a control in the
  // placement pane, not a gesture.
  if (bare && !plotted.x && !plotted.y) {
    const hosts = new Set(dgeGuideHosts(ctx, id, ctx.eff).map((h) => h.id));
    const radius = DGE_GUIDE_CELL * Math.min(uw, uh);
    for (const [aId, zId] of dgeGuidePairs(ctx)) {
      if (!hosts.has(aId) || !hosts.has(zId)) continue;
      const A = ctx.boxes.get(aId), Z = ctx.boxes.get(zId);
      if (!A || !Z) continue;
      const ax = A.x + A.w / 2, ay = A.y + A.h / 2;
      const vx = (Z.x + Z.w / 2) - ax, vy = (Z.y + Z.h / 2) - ay;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1) continue;
      // Along the line is `frac`, and it rounds on the same 0.05 grid every
      // other number in the block does.
      const t = dgeRound(((want.x - ax) * vx + (want.y - ay) * vy) / len2, DGE_SNAP_CELL);
      if (t < DGE_FRAC_MIN || t > 1 - DGE_FRAC_MIN) continue;
      const px = ax + vx * t, py = ay + vy * t;
      // Off the line, and the radius is what keeps this honest: `between`
      // fixes both coordinates, so on a drag along one axis it also moves the
      // other – by at most this much, and only because the element was
      // already that close to the line it is being attached to.
      const d = Math.hypot(px - want.x, py - want.y);
      if (d > radius) continue;
      cands.push({ kind: 'between', rank: DGE_RANK.between, dist: d, axes: ['x', 'y'],
        a: aId, z: zId, frac: t, at: [px, py] });
    }
  }

  // ── the same gap a sibling already has ──
  if (place && place.kind === 'rel') {
    const axis = dgeMainAxis(place);
    const ref = ctx.boxes.get(place.ref);
    if (live[axis] && ref) {
      const sign = (place.dir === 'right' || place.dir === 'below') ? 1 : -1;
      // Read the gap off the geometry rather than adding the delta to the
      // number on the line. At beat 0 the two agree exactly. At a beat they
      // do not: the element carries whatever `move … by` put in front of it,
      // and a step's `move … to` clears that shift – so the gap that lands
      // the box under the pointer is the one measured from the two edges as
      // they stand. The placement's own `offset` is subtracted because it is
      // re-emitted beside the gap and would otherwise be counted twice.
      const off = place.offset || [0, 0];
      const gapAt = (cx, cy) => (place.dir === 'right'
        ? (cx - off[0] * uw - b.w / 2 - (ref.x + ref.w)) / uw
        : place.dir === 'left' ? (ref.x - (cx - off[0] * uw + b.w / 2)) / uw
          : place.dir === 'below' ? (cy - off[1] * uh - b.h / 2 - (ref.y + ref.h)) / uh
            : (ref.y - (cy - off[1] * uh + b.h / 2)) / uh);
      const was = gapAt(b.x + b.w / 2, b.y + b.h / 2);
      const raw = gapAt(want.x, want.y);
      for (const s of dgeSiblingGaps(ctx, id, axis)) {
        const d = Math.abs(s.gap - raw);
        if (d > DGE_GUIDE_CELL) continue;      // in cells, which is what a gap is
        cands.push({ kind: 'gap', rank: DGE_RANK.gap, tier: s.near ? 0 : 1, dist: d,
          axes: [axis], axis, gap: s.gap, from: s.from, sign, was });
      }
    }
  }

  // ── equal spacing across three or more -> spread x | spread y ──
  // Not at a beat. `spread` has no step form, so writing one would change the
  // opening picture from inside a statement that promises not to – and the
  // other three guides all have one, which is why this is the single row of
  // §9.2's table that a beat cannot offer.
  for (const axis of (beat ? [] : ['x', 'y'])) {
    if (!live[axis] || plotted[axis]) continue;
    // Already in one on this axis: there is nothing to offer, and a second
    // statement over the first is not an offer, it is a mess.
    if (ctx.model.spreads.some((s) => s.axis === axis && s.members.includes(id))) continue;
    const cross = axis === 'x' ? 'y' : 'x';
    const run = [];
    for (const h of dgeGuideHosts(ctx, id, ctx.eff)) {
      // Only what a `spread` may name: it overrides a coordinate the node
      // branch of the walk computes, so a container, a brace or an edge in the
      // member list is a build error rather than a line doing nothing.
      if (!h.node) continue;
      const c = { x: h.b.x + h.b.w / 2, y: h.b.y + h.b.h / 2 };
      if (Math.abs(c[cross] - want[cross]) > DGE_GUIDE_CELL * unit[cross]) continue;
      run.push({ id: h.id, v: c[axis], cross: c[cross] });
    }
    if (run.length < 2) continue;
    run.push({ id, v: want[axis], cross: want[cross] });
    run.sort((p, q) => p.v - q.v);
    const k = run.findIndex((p) => p.id === id);
    // The dragged element has to be an interior member. An end of a `spread`
    // is an anchor and the statement says nothing about where an anchor goes,
    // so snapping one to "equal spacing" would be snapping it to wherever it
    // already was.
    if (k <= 0 || k >= run.length - 1) continue;
    const first = run[0].v, last = run[run.length - 1].v;
    const target = first + (last - first) * (k / (run.length - 1));
    const d = Math.abs(target - want[axis]);
    if (d > DGE_SPREAD_CELL * unit[axis]) continue;
    cands.push({ kind: 'spread', rank: DGE_RANK.spread, dist: d, axes: [axis],
      axis, members: run.map((p) => p.id), target, run, dragged: id });
  }

  if (!cands.length) return none;
  cands.sort((p, q) => (p.rank - q.rank) || ((p.tier || 0) - (q.tier || 0)) || (p.dist - q.dist));
  const claimed = new Set();
  const won = [];
  for (const c of cands) {
    if (c.axes.some((a) => claimed.has(a))) continue;
    // At a beat, an axis a set owns cannot be moved by a `move … to`: the
    // align or spread override runs *after* the placement and before the
    // shift, so the guide would promise a position the layout then takes
    // away. The ordinary `move … by` still goes through, which is why this
    // drops the candidate instead of refusing the drag.
    if (beat && c.axes.some((a) => ctx.spans.constrainedBy(id, a))) continue;
    for (const a of c.axes) claimed.add(a);
    won.push(c);
  }
  if (!won.length) return none;
  const out = dgeGuideApply(ctx, id, dx, dy, want, won);
  if (beat) out.snap.to = dgeStepToText(ctx, id, out, eff, want);
  return out;
}

// The winning guides as the one statement a beat can carry: `move x to …`.
// Every guide the grammar can propose is a *placement*, and `move … to` takes
// a placement, so the same four candidates say the same four things here –
// only the token they land in changes, which is exactly what the author
// should not have to think about.
//
// The coordinate no guide claimed is the element's own, as it stands at this
// beat. Where the element's line is still what places it and nothing has been
// shifted in front of it, that coordinate is re-emitted verbatim from the
// source, so a reference on the axis nobody dragged survives. Where a step
// has already moved it, the opening line's expression is no longer a true
// statement about where it is, and the resolved number is.
function dgeStepToText(ctx, id, out, eff, want) {
  const { uw, uh } = dgeUnits(ctx.model);
  const place = eff.place;
  if (out.snap.place) return out.snap.place;                 // between a,b frac t
  if (out.snap.gap != null && place && place.kind === 'rel') {
    return dgeRelText(place, out.snap.gap);
  }
  const comp = (axis, i) => {
    if (out.snap.ref[axis]) return out.snap.ref[axis];
    const sp = eff.own && place && place.kind === 'abs' && !eff.shift[i]
      ? dgeSpanIn(ctx, id, 'at.' + axis) : null;
    if (sp && sp.present) return sp.text;
    return dgeNum(dgeRound(want[axis] / (axis === 'x' ? uw : uh), DGE_SNAP_CELL));
  };
  return comp('x', 0) + ',' + comp('y', 1);
}

// A `rel` placement written back out, with one number replaced. The align
// word and the offset have to travel with it: `move x to right of a gap 0.6`
// is a whole placement, so anything left off is a thing the step silently
// resets.
function dgeRelText(place, gap) {
  let out = dgePlaceText(place.dir, place.ref, gap == null ? place.gap : gap);
  if (place.align && place.align !== 'center') out += ' align ' + place.align;
  const off = place.offset;
  if (off && (off[0] || off[1])) out += ` offset ${dgeNum(off[0])},${dgeNum(off[1])}`;
  return out;
}

// The winning candidates as the three things the caller needs: the delta the
// drag now means, the snap dgePlanDrag has to honour, and the drawing.
function dgeGuideApply(ctx, id, dx, dy, want, won) {
  const b = ctx.boxes.get(id);
  const { uw, uh } = dgeUnits(ctx.model);
  const unit = { x: uw, y: uh };
  const out = { dx, dy, nodes: [],
    snap: { at: {}, ref: {}, to: null, gap: null, place: null, append: null,
      appendAt: null, appendAxis: null, why: '' } };
  const why = [];
  // Move the drag itself onto the candidate, so the preview, the guide and
  // the line the status bar shows are all describing the same position.
  const shift = (axis, to) => {
    const from = axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2;
    if (axis === 'x') out.dx = (to - from) / uw; else out.dy = (to - from) / uh;
    want[axis] = to;
  };
  for (const c of won) {
    if (c.kind === 'at') {
      for (const part of c.parts) {
        shift(part.axis, part.line);
        // A component that is already a reference keeps it: the nudge falls to
        // nothing and the existing `at.<axis>.nudge` path writes that. Only a
        // bare number is upgraded, and then the component *is* the reference,
        // with no nudge beside it.
        if (!part.held) out.snap.at[part.axis] = part.host + '.' + part.prop;
        // What the component *resolves to* either way, which is what a beat's
        // `move … to` has to spell out in full – a held part has no nudge left
        // on it once the guide has brought it back onto the line.
        out.snap.ref[part.axis] = part.host + '.' + part.prop;
        why.push(part.held
          ? `back on ${part.host}.${part.prop}`
          : `${part.host}.${part.prop} – on ${part.host}'s ${DGE_PROP_WORD[part.prop]}`);
        out.nodes.push(...dgeGuideLine(ctx, id, part, want));
      }
    } else if (c.kind === 'between') {
      shift('x', c.at[0]);
      shift('y', c.at[1]);
      const frac = Math.abs(c.frac - 0.5) < 1e-6 ? '' : ' frac ' + dgeNum(c.frac);
      out.snap.place = `between ${c.a},${c.z}${frac}`;
      why.push(`between ${c.a},${c.z}${frac} – and it stays there when either of them moves`);
      out.nodes.push(...dgeGuideBetween(ctx, c));
    } else if (c.kind === 'gap') {
      // `place.gap + sign * delta` is the gap the drag resolves to, so the
      // delta that lands exactly on the sibling's number is one subtraction.
      shift(c.axis, (c.axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2)
        + (c.gap - c.was) * c.sign * unit[c.axis]);
      out.snap.gap = c.gap;
      why.push(`gap ${dgeNum(c.gap)} – the same gap ${c.from} has, so the row stays regular`);
      out.nodes.push(...dgeGuideGap(ctx, c));
    } else if (c.kind === 'spread') {
      shift(c.axis, c.target);
      const line = `spread ${c.axis} ${c.members.join(', ')}`;
      out.snap.append = line;
      out.snap.appendAxis = c.axis;
      out.snap.appendAt = dgeAppendSplice(ctx.source, line);
      why.push(`${line} – equal centre distances, and the statement that keeps them equal`);
      out.nodes.push(...dgeGuideSpread(c));
    }
  }
  out.snap.why = why.join(' · ');
  return out;
}

// The drawing, in the register every other guide here uses: a hairline in the
// relation styles, its label in --ink-soft. `dge-nb` is what makes them
// addressable as a family – the lesson `.dge-chip-via` taught in the panel,
// one class per kind of mark.
const dgeGuideMark = (tag, attrs) =>
  dgeEl(tag, { ...attrs, class: 'dge-nb' });
// The label keeps dge-rel-label's paper halo and takes only the marker class:
// dge-nb carries the hairline's stroke and dash, and on a <text> that paints a
// dashed outline round every glyph instead of the halo that makes a label
// readable over a drawing.
const dgeGuideLabel = (x, y, text) =>
  dgeEl('text', { class: 'dge-rel-label dge-nb-label', x, y, text });

function dgeGuideLine(ctx, id, part, want) {
  const hb = ctx.boxes.get(part.host);
  const b = ctx.boxes.get(id);
  if (!hb || !b) return [];
  const label = part.host + '.' + part.prop;
  if (part.axis === 'x') {
    const lo = Math.min(hb.y, want.y - b.h / 2) - 14;
    const hi = Math.max(hb.y + hb.h, want.y + b.h / 2) + 14;
    return [dgeGuideMark('line', { x1: part.line, y1: lo, x2: part.line, y2: hi }),
      dgeGuideLabel(part.line + 4, lo - 4, label)];
  }
  const lo = Math.min(hb.x, want.x - b.w / 2) - 14;
  const hi = Math.max(hb.x + hb.w, want.x + b.w / 2) + 14;
  return [dgeGuideMark('line', { x1: lo, y1: part.line, x2: hi, y2: part.line }),
    dgeGuideLabel(hi + 4, part.line - 4, label)];
}

function dgeGuideBetween(ctx, c) {
  const A = ctx.boxes.get(c.a), Z = ctx.boxes.get(c.z);
  if (!A || !Z) return [];
  const ax = A.x + A.w / 2, ay = A.y + A.h / 2;
  const zx = Z.x + Z.w / 2, zy = Z.y + Z.h / 2;
  return [
    dgeGuideMark('line', { x1: ax, y1: ay, x2: zx, y2: zy }),
    dgeGuideMark('circle', { cx: c.at[0], cy: c.at[1], r: dgeGrabTolerance(3.5) }),
    dgeGuideLabel(c.at[0] + 8, c.at[1] - 8, `between ${c.a},${c.z} frac ${dgeNum(c.frac)}`),
  ];
}

// The sibling's own gap, marked the way dgeDrawRelations marks the dragged
// element's – the callout a design tool makes when two spacings match, except
// that here the match can be written down.
function dgeGuideGap(ctx, c) {
  const sib = dgeFind(c.from, ctx.model);
  const b = ctx.boxes.get(c.from);
  const ref = sib && sib.place ? ctx.boxes.get(sib.place.ref) : null;
  if (!b || !ref) return [];
  const dir = sib.place.dir;
  if (dir === 'right' || dir === 'left') {
    const y = b.y + b.h / 2;
    const from = dir === 'right' ? ref.x + ref.w : ref.x;
    const to = dir === 'right' ? b.x : b.x + b.w;
    return [dgeGuideMark('line', { x1: from, y1: y, x2: to, y2: y }),
      dgeGuideLabel((from + to) / 2 - 12, y - 5, 'gap ' + dgeNum(c.gap))];
  }
  const x = b.x + b.w / 2;
  const from = dir === 'below' ? ref.y + ref.h : ref.y;
  const to = dir === 'below' ? b.y : b.y + b.h;
  return [dgeGuideMark('line', { x1: x, y1: from, x2: x, y2: to }),
    dgeGuideLabel(x + 5, (from + to) / 2, 'gap ' + dgeNum(c.gap))];
}

// Matched marks between consecutive centres, which is what `spread` means –
// the same treatment dgeDrawRelations gives a spread the element is already
// in, so that arriving at one looks like the thing it is about to become.
function dgeGuideSpread(c) {
  // The dragged element's entry was measured before the snap moved it, so
  // read its position off the target instead: the marks have to be equal or
  // they are saying the opposite of what the statement would do.
  const pos = c.run.map((m) => (m.id === c.dragged ? c.target : m.v));
  const lane = Math.min(...c.run.map((m) => m.cross)) - 26;
  const out = [];
  for (let i = 1; i < pos.length; i++) {
    const a = pos[i - 1], z = pos[i];
    if (c.axis === 'x') {
      out.push(dgeGuideMark('line', { x1: a, y1: lane, x2: z, y2: lane }));
      out.push(dgeGuideLabel((a + z) / 2 - 4, lane - 4, '='));
    } else {
      out.push(dgeGuideMark('line', { x1: lane, y1: a, x2: lane, y2: z }));
      out.push(dgeGuideLabel(lane - 10, (a + z) / 2, '='));
    }
  }
  return out;
}

// ── resize guides ───────────────────────────────────────────────────
// The same idea one gesture along: a snap target is only worth drawing if the
// grammar can name what it would write. Two things it can, and they are not
// the same kind of thing, which is why the two handles get different offers.
//
// **An edge handle proposes a number, never `same as`.** `same as X` copies
// *both* dimensions, so offering it from a width-only drag would change the
// height as well – a semantic jump the author did not ask for – and the
// grammar has no "w equals X's w" relation to offer instead. So the edge
// handle offers the number a sibling already carries, exactly the shape the
// sibling-gap guide has, and marks it on the sibling that carries it.
//
// **`same as X` is the corner handle's, and only when both dimensions land on
// one element together.** There it *is* a relation: the box goes on matching
// X when X changes, which is the whole reason the construct exists.
//
// Only numbers the author actually wrote count, for the reason the gap guide
// gives: an unwritten `w` is the label's own measurement, and copying that as
// a literal pins this box to today's typesetting. A `same as` has no such
// problem, because it copies the box rather than a number – so it is offered
// against any element's real geometry.
function dgeSiblingSizes(ctx, id, attr) {
  if (ctx.sizesFor !== id) { ctx.sizesFor = id; ctx.sizes = new Map(); }
  if (ctx.sizes.has(attr)) return ctx.sizes.get(attr);
  const me = dgeFind(id, ctx.model);
  const out = [];
  for (const n of ctx.model.nodes) {
    if (n.id === id || (n.synth && n.synth !== n.id)) continue;
    // A dot is measured by its radius and everything else by its sides, so
    // the two vocabularies never mix: `r 0.09` says nothing to a box.
    if ((n.kind === 'dot') !== (me && me.kind === 'dot')) continue;
    const sp = ctx.spans.spanOf(n.id, attr);
    if (!sp || !sp.present) continue;
    const v = Number(sp.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    out.push({ v, from: n.id });
  }
  ctx.sizes.set(attr, out);
  return out;
}

// Everything a resize lights up. Same contract as dgeGuideSnap: the adjusted
// delta, the snap the plan has to honour, and the drawing.
function dgeResizeSnap(ctx, id, dw, dh, handle, opts) {
  const none = { dw, dh, snap: null, nodes: [] };
  if (opts && opts.free) return none;
  const el = dgeFind(id, ctx.model);
  const b = ctx.boxes.get(id);
  if (!el || !b) return none;
  // The three statements that size themselves by something other than a plain
  // w and h – a grid by its cell, a table by one row, a lanes by one lane –
  // answer a handle in their own word, so a sibling's `w` is not a number they
  // could take.
  if (el.frame) return none;
  // The same dead zone the move guides keep, and for a sharper reason here: a
  // side that has barely moved is not part of the drag, and without this a
  // tremor of a pixel rewrites `w 0.8` as the 0.82 a sibling happens to carry.
  // Worse, on an element already the size of its neighbour it would rewrite
  // the token with itself, and the gesture would end by reporting that nothing
  // in the source changed.
  const live = { w: Math.abs(dw) > DGE_GUIDE_DEAD, h: Math.abs(dh) > DGE_GUIDE_DEAD };
  if (!live.w && !live.h) return none;
  const { uw, uh } = dgeUnits(ctx.model);
  const snap = { w: null, h: null, sameAs: null, why: '' };
  const nodes = [];
  const why = [];
  const out = { dw, dh, snap, nodes };
  const wantW = b.w + dw * uw, wantH = b.h + dh * uh;

  // A dot has one number and three handles, all of which write it.
  if (el.kind === 'dot') {
    const rWant = (b.w / 2 + dw * uw / 2) / uh;
    for (const s of (live.w ? dgeSiblingSizes(ctx, id, 'r') : [])) {
      if (Math.abs(s.v - rWant) > DGE_GUIDE_CELL) continue;
      snap.r = s.v;
      out.dw = (s.v * 2 * uh - b.w) / uw;
      why.push(`r ${dgeNum(s.v)} – the same radius ${s.from} is given`);
      nodes.push(...dgeGuideSize(ctx, s.from, 'r', 'r ' + dgeNum(s.v)));
      break;
    }
    snap.why = why.join(' · ');
    return why.length ? out : none;
  }

  // The corner, and only the corner: both dimensions on one element, so the
  // relation is true of the box rather than of one of its sides.
  if (handle === 'se') {
    let best = null;
    for (const h of dgeGuideHosts(ctx, id)) {
      // Nothing to propose where the line already says it: the offer would
      // rewrite the token with itself, and the gesture would end by reporting
      // that nothing in the source changed.
      if (!h.node || h.id === el.sameAs) continue;
      const dwPx = Math.abs(h.b.w - wantW), dhPx = Math.abs(h.b.h - wantH);
      if (dwPx > DGE_GUIDE_CELL * uw || dhPx > DGE_GUIDE_CELL * uh) continue;
      const d = dwPx / uw + dhPx / uh;
      if (!best || d < best.d) best = { id: h.id, b: h.b, d };
    }
    if (best) {
      snap.sameAs = best.id;
      out.dw = (best.b.w - b.w) / uw;
      out.dh = (best.b.h - b.h) / uh;
      snap.why = `same as ${best.id} – and it goes on matching ${best.id} when ${best.id} changes`;
      nodes.push(...dgeGuideSame(ctx, id, best));
      return out;
    }
  }

  if (handle !== 's' && live.w) {
    for (const s of dgeSiblingSizes(ctx, id, 'w')) {
      if (Math.abs(s.v - wantW / uw) > DGE_GUIDE_CELL) continue;
      snap.w = s.v;
      out.dw = s.v - b.w / uw;
      why.push(`w ${dgeNum(s.v)} – the same width ${s.from} is given`);
      nodes.push(...dgeGuideSize(ctx, s.from, 'w', 'w ' + dgeNum(s.v)));
      break;
    }
  }
  if (handle !== 'e' && live.h) {
    for (const s of dgeSiblingSizes(ctx, id, 'h')) {
      if (Math.abs(s.v - wantH / uh) > DGE_GUIDE_CELL) continue;
      snap.h = s.v;
      out.dh = s.v - b.h / uh;
      why.push(`h ${dgeNum(s.v)} – the same height ${s.from} is given`);
      nodes.push(...dgeGuideSize(ctx, s.from, 'h', 'h ' + dgeNum(s.v)));
      break;
    }
  }
  snap.why = why.join(' · ');
  return why.length ? out : none;
}

// A bracket across the side of the sibling that carries the number, which is
// the same mark dgeDrawRelations puts on a `same as` source – the callout a
// design tool makes when two measurements match, except that here the match
// is a token in the text.
function dgeGuideSize(ctx, from, axis, text) {
  const b = ctx.boxes.get(from);
  if (!b) return [];
  if (axis === 'h') {
    return [dgeGuideMark('line', { x1: b.x - 9, y1: b.y, x2: b.x - 9, y2: b.y + b.h }),
      dgeGuideLabel(b.x - 13, b.y + b.h / 2, text)];
  }
  return [dgeGuideMark('line', { x1: b.x, y1: b.y - 9, x2: b.x + b.w, y2: b.y - 9 }),
    dgeGuideLabel(b.x + b.w / 2 - 14, b.y - 13, text)];
}

// `same as` mirrored onto its source, both brackets drawn, because the claim
// is about the two boxes together.
function dgeGuideSame(ctx, id, host) {
  const b = ctx.boxes.get(id);
  if (!b) return [];
  return [
    dgeGuideMark('rect', { x: host.b.x - 2, y: host.b.y - 2,
      width: host.b.w + 4, height: host.b.h + 4, rx: 3 }),
    dgeGuideMark('line', { x1: host.b.x, y1: host.b.y - 9, x2: host.b.x + host.b.w, y2: host.b.y - 9 }),
    dgeGuideMark('line', { x1: b.x, y1: b.y - 9, x2: b.x + b.w, y2: b.y - 9 }),
    dgeGuideLabel(host.b.x + host.b.w / 2 - 22, host.b.y - 13, 'same as ' + host.id),
  ];
}

function dgePlanDrag(ctx, id, dx, dy, opts) {
  const el = dgeFind(id, ctx.model);
  // An id that names a statement rather than an element. Every other
  // expanding statement draws a frame carrying its own name, and dragging a
  // cell or a lane moves that frame – which is what the gesture means. A
  // `bars … series of X` draws columns in a frame it does not own and there is
  // no element called after it at all, so the hit test hands back a name
  // nothing answers to. Silently, until this: the drag ran, planned nothing,
  // and looked like an editor that had stopped responding.
  if (!el) {
    const refusals = [];
    const owned = dgeSynthOwner(id, ctx.model);
    if (owned && DGE.selection.length <= 1) {
      refusals.push('a series is drawn in the frame of the chart it joined, so it has no '
        + 'placement of its own – drag that chart and its columns follow.');
    }
    return { edits: [], refusals };
  }
  const place = el.place;
  const edits = [];
  const refusals = [];
  // A sequence entry has no placement of its own. The statement owns the
  // vertical rhythm - that is the whole of what it owns - and the line the
  // author wrote carries a label and an attribute tail and nothing a drag
  // could rewrite. Said before the kind check below, or a message would get
  // the generic "an edge follows its endpoints", which is true of every edge
  // and useless about this one.
  if (el.entry) {
    if (DGE.selection.length <= 1) {
      refusals.push(`a sequence stacks its ${el.entry}s on its own rhythm, so this line holds `
        + `no placement - drag ${el.synth} to move the whole figure, or set space on the line `
        + 'to change the gap above this one.');
    }
    return { edits: [], refusals, strain };
  }
  const free = opts && opts.free;      // Ctrl/Cmd held: no snapping
  const leave = opts && opts.leave;    // Alt held: leave the set at once
  const snap = (v) => (free ? v : dgeRound(v, DGE_SNAP_CELL));
  let strain = null;

  // Only a node's statement can hold a placement. A container or brace
  // follows its members and an edge its endpoints – planning `at x,y` for
  // one spliced a token their statements refuse, and because a selection is
  // committed as one splice, Ctrl-A-and-move was reverted whole in any
  // figure that contained a container. They contribute nothing instead, and
  // say so only when they are what was actually grabbed.
  if (!['box', 'dot', 'text', 'image'].includes(el.kind)) {
    if (DGE.selection.length <= 1) {
      refusals.push(el.kind === 'edge'
        ? `an edge follows its endpoints – drag those, and it re-routes.`
        : `a ${el.kind} follows its members – drag those, and it re-fits.`);
    }
    return { edits: [], refusals, strain };
  }

  // A coordinate owned by a set is not this element's to move – until the
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
  // an ordinary nudge – leaving has to be something you meant.
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
  let xBlocked = dx !== 0 && held('x', dx);
  let yBlocked = dy !== 0 && held('y', dy);

  // What a neighbour guide claimed, if one did (dgeGuideSnap, §9.2). It is
  // passed in rather than computed here because the same answer has to move
  // the preview and draw the guide, and because the candidate set is a
  // property of the *gesture* – cached on the ctx captured at pointerdown –
  // rather than of one plan.
  const guide = (opts && opts.snap) || null;
  // A statement the drag adds rather than rewrites: `spread x a, b, c`. First
  // in the list so dgeShowPlan reads its sentence, and out of the way of every
  // span in this element's own line because it goes at the end of the block.
  if (guide && guide.append && !xBlocked && !yBlocked) {
    edits.push({ raw: [guide.appendAt[0], guide.appendAt[0]], value: guide.appendAt[1],
      why: guide.why });
    // And that axis is now the statement's, not the placement's. Writing the
    // ordinary edit as well left an `offset 0,0.5` on the line that the spread
    // immediately overrode – dead weight, and a reader has no way to tell it
    // apart from an offset that is doing something.
    if (guide.appendAxis === 'x') xBlocked = true; else yBlocked = true;
  }
  // A guide that replaces the whole placement expression – `between a,b`.
  // Nothing else about the drag is left to say once it has.
  if (guide && guide.place && !xBlocked && !yBlocked) {
    edits.push({ attr: 'place', value: guide.place, why: guide.why });
    return { edits, refusals, strain };
  }

  if (!place || place.implicit) {
    // Nothing in the source to rewrite. The first element sits at the origin
    // for free; giving it a position means writing the placement out. A ref
    // coordinate the guide found goes in whole, in place of the number that
    // half would otherwise have been.
    const cx = (guide && guide.at.x) || dgeNum(snap(dx));
    const cy = (guide && guide.at.y) || dgeNum(snap(dy));
    edits.push({ attr: 'place', value: `at ${cx},${cy}`,
      why: (guide && guide.why) || 'writes the placement out' });
    return { edits, refusals, strain };
  }

  if (place.kind === 'abs') {
    const parts = place.at || [];
    const axes = [['x', 0, dx, xBlocked], ['y', 1, dy, yBlocked]];
    for (const [axis, i, delta, isBlocked] of axes) {
      // A guide that found a line on this axis writes even when the snap put
      // the element back exactly where it started. That is not a no-op: the
      // number stays where it was and the *text* becomes `sw.cy`, which is
      // the whole trade this feature exists to make – a coincidence turned
      // into a relation. Skipping it meant the status bar naming a line the
      // source never got, which is the shape of defect this editor keeps
      // closing.
      const named = guide && guide.at[axis];
      if ((!delta && !named) || isBlocked) continue;
      const c = parts[i];
      if (c && c.ref) {
        // Already a reference, so there is nothing for `named` to add and a
        // zero delta really is a no-op here.
        if (!delta) continue;
        // A plot coordinate is a reference too, and the compiler has already
        // spent it: there is no nudge on the line to rewrite, so it is the
        // value that moves.
        const plotted = dgePlotCoordEdit(ctx, id, `at.${axis}`, axis, delta, free);
        if (plotted) { edits.push(plotted); continue; }
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
        // A bare number, and a guide may have found a line the grammar can
        // name where it lands. Writing `m0.cx` rather than the number it
        // resolves to today is the whole difference between this and a
        // drawing tool's smart guides – and once it is there, §9.3's nudge
        // branch above keeps it through every later drag.
        edits.push({ attr: `at.${axis}`,
          value: named || dgeNum(snap((c ? c.unit : 0) + delta)),
          why: named ? guide.why : undefined });
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
  // edge if the drop lands near one, and an offset past a tolerance – unless
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
    // A sibling's number, exactly, when a guide matched one: the point of the
    // callout is that the two gaps are the *same*, and rounding it onto the
    // 0.05 grid afterwards would turn 0.62 into 0.60 and quietly break the
    // equality the guide had just promised.
    const sib = guide && guide.gap;
    const next = sib != null ? sib : Math.max(0, snap(place.gap + sign * mainDelta));
    edits.push({ attr: 'gap', value: dgeNum(next), why: sib != null ? guide.why : undefined });
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
function dgePlanResize(ctx, id, dw, dh, handle, opts) {
  const el = dgeFind(id, ctx.model);
  const b = ctx.boxes.get(id);
  if (!el || !b) return { edits: [], refusals: [] };
  const { uw, uh } = dgeUnits(ctx.model);
  const edits = [];
  // What a resize guide claimed, if one did (dgeResizeSnap). Passed in for
  // the same reason the move gesture passes its own: one answer has to move
  // the preview, draw the mark and write the token, or the three disagree.
  const guide = (opts && opts.snap) || null;
  if (el.kind === 'dot') {
    const next = guide && guide.r != null ? guide.r
      : Math.max(0.02, dgeRound((b.w / 2 + dw * uw / 2) / uh, DGE_SNAP_CELL));
    edits.push({ attr: 'r', value: dgeNum(next), why: guide && guide.r != null ? guide.why : undefined });
    return { edits, refusals: [] };
  }
  // A grid is sized by its cell – the statement refuses `w` and `h`, so the
  // handle used to splice two words the compiler then rejected and the whole
  // drag was reverted. Scaling the cell says the same thing in the word the
  // statement takes; `space` follows its default, or keeps the author's.
  if (el.frame === 'grid') {
    const sp = ctx.spans.spanOf(id, 'cell');
    const cur = sp && sp.present ? Number(sp.value) : 0.25;
    const w0 = b.w / uw, h0 = b.h / uh;
    const scale = handle === 's' ? (h0 + dh) / h0 : (w0 + dw) / w0;
    const next = Math.max(0.02, dgeRound(cur * scale, 0.01));
    if (next !== cur) edits.push({ attr: 'cell', value: dgeNum(next), why: 'a grid is sized by its cell' });
    return { edits, refusals: [] };
  }
  // A `table`'s `h` is the height of one row and a `lanes`'s the height of one
  // lane – but the handle is on the frame, which is the whole stack of them.
  // Written straight, one drag on the south edge of a four-row table made it
  // four times too tall, and nothing said so: the word parsed, the number was
  // the one the pointer asked for, and the drawing was wrong. Divide by what
  // the statement repeats.
  //
  // Across, a lane band really is the frame's width. A table's is the sum of
  // its columns, so once the author has written `col` the drag scales that
  // list – `w` is the word the statement stops reading the moment `col` is
  // there, and writing it would have been a resize that did nothing at all.
  if (el.frame === 'table' || el.frame === 'lanes') {
    const n = dgeRepeatCount(el, ctx.model);
    const w0 = b.w / uw, h0 = b.h / uh;
    if (handle !== 'e' && n) {
      const next = Math.max(0.05, dgeRound((h0 + dh) / n, 0.01));
      edits.push({ attr: 'h', value: dgeNum(next),
        why: `h is one ${el.frame === 'table' ? 'row' : 'lane'}, and there are ${n}` });
    }
    if (handle !== 's') {
      const cols = dgeSpanIn(ctx, id, 'col');
      const widths = cols && cols.present
        ? String(cols.value).split(',').map((x) => Number(x.trim())) : null;
      const scale = w0 ? (w0 + dw) / w0 : 1;
      if (widths && widths.every((x) => Number.isFinite(x)) && scale > 0) {
        edits.push({ attr: 'col', why: 'the columns carry their own widths, so all of them scale',
          value: widths.map((x) => dgeNum(Math.max(0.05, dgeRound(x * scale, 0.01)))).join(',') });
      } else {
        edits.push({ attr: 'w', value: dgeNum(Math.max(0.05, dgeRound(w0 + dw, DGE_SNAP_CELL))) });
      }
    }
    return { edits, refusals: [] };
  }
  // The corner landed on another element's box. That is a relation rather
  // than two numbers, so the two numbers come off the line: `same as` wins
  // over an explicit `w` in sizeOf, and a `w` left standing beside it is a
  // token that reads as if it were doing something.
  if (guide && guide.sameAs) {
    edits.push({ attr: 'same-as', value: guide.sameAs, why: guide.why });
    for (const key of ['w', 'h']) {
      const sp = dgeSpanIn(ctx, id, key);
      if (sp && sp.present) edits.push({ attr: key, value: '', drop: true });
    }
    return { edits, refusals: [] };
  }
  if (el.sameAs) {
    edits.push({ attr: 'same-as', value: '', drop: true, why: `"just this one" – drops "same as ${el.sameAs}"` });
  }
  if (handle !== 's') {
    // A sibling's number exactly, when a guide matched one: the point of the
    // callout is that the two are the *same*, and rounding it onto the 0.05
    // grid afterwards would break the equality the guide had just promised.
    const sib = guide && guide.w;
    edits.push({ attr: 'w', why: sib != null ? guide.why : undefined,
      value: dgeNum(sib != null ? sib : Math.max(0.05, dgeRound(b.w / uw + dw, DGE_SNAP_CELL))) });
  }
  if (handle !== 'e') {
    const sib = guide && guide.h;
    edits.push({ attr: 'h', why: sib != null ? guide.why : undefined,
      value: dgeNum(sib != null ? sib : Math.max(0.05, dgeRound(b.h / uh + dh, DGE_SNAP_CELL))) });
  }
  return { edits, refusals: [] };
}

// One edit to one splice against the text as it was at pointerdown. Kept as
// its own function because two callers need it and used to carry a copy each:
// dgeApplyEdits for a single element, dgeMoveSelection for a whole selection.
// Adding the `raw` case meant editing both, which is the reason to stop.
function dgeResolveEdits(ctx, id, edits, into) {
  // Two edits can share an insertion point – a `w` and an `h` on a line that
  // has neither both go at the end – and because the splices are applied right
  // to left, the one applied *last* ends up first in the text. Number them, so
  // the order the plan was written in is the order the line reads in;
  // dgeApplySplices carries the same tie-break for the same reason. Without it
  // a resize wrote `h 1 w 0.95`, which parses and reads backwards.
  const seq = () => into.length;
  for (const e of edits) {
    // An edit to somebody else's line. Leaving a shared axis rewrites the
    // align or spread statement, which is not an attribute of the element
    // being dragged and has no entry in its span table.
    if (e.raw) { into.push({ start: e.raw[0], end: e.raw[1], text: e.value, seq: seq() }); continue; }
    const sp = dgeSpanIn(ctx, id, e.attr === 'same-as' ? 'same-as' : e.attr);
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
      into.push({ start, end: sp.end, text: '', seq: seq() });
      continue;
    }
    into.push({ start: sp.start, end: sp.end, text: sp.prefix + e.value + sp.suffix, seq: seq() });
  }
  return into;
}

// Right to left, so the earlier spans keep the offsets they were measured at,
// and `seq` breaks a tie between two edits that share one insertion point.
function dgeSplice(source, splices) {
  let out = source;
  for (const r of [...splices].sort((a, b) => (b.start - a.start) || ((b.seq || 0) - (a.seq || 0)))) {
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
// recompiles, which leaves DGE.problems empty again – so a caller that wants
// to say something about its own edit cannot tell from the state whether
// there was one, and dgeSetSlot went on to report a width it had just undone.
function dgeSetSource(next, opts) {
  if (next === DGE.source) return false;
  const before = DGE.source;
  const wasClean = !(DGE.problems && DGE.problems.length);
  const snapshotted = !opts || opts.snapshot !== false;
  // Captured for the rollback below. An edit that was refused has to leave no
  // trace at all: the footer said "edited" over source that is byte-identical
  // to what was opened, and dgeSnapshot cleared a redo the author could still
  // have wanted, for a change that never happened.
  const wasDirty = DGE.dirty;
  const hadRedo = DGE.redo ? DGE.redo.slice() : [];
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
  // compiled again the canvas never changed – the panel looked like it was
  // doing nothing while it took the source apart.
  if (wasClean && DGE.problems.length && !(opts && opts.allowBroken)) {
    const why = DGE.problems[0];
    DGE.source = before;
    if (snapshotted) DGE.undo.pop();
    DGE.dirty = wasDirty;
    if (DGE.redo) DGE.redo.splice(0, DGE.redo.length, ...hadRedo);
    dgeRecompile();
    // Say what happened before saying why, and **name no line**. The
    // compiler's sentence is about the text that was just rolled back, so a
    // line number sends the author to a line that no longer contains what the
    // message names – "line 3: box c: .shrink …" while line 3 reads
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
// block to learn what the DOM already knows. Coupled to dgPathD and
// dgSplineD, the two texts that ever write this attribute.
function dgeEdgePts(id) {
  const svg = dgeQ('#dge-art-svg');
  if (!svg) return null;
  // Scoped to the editor's own copy. The slide behind the modal holds the
  // same figure with the same prefixed ids, and getElementById would answer
  // with whichever of the two comes first in the document.
  const path = svg.querySelector('[id="' + DGE.prefix + id + '--p"]');
  const d = path && path.getAttribute('d');
  if (!d) return null;
  // Per command, not pairwise over every number: a `.smooth` edge is the
  // same waypoint vector drawn as Béziers, and each C carries two control
  // points before its anchor. Read pairwise, those control points became
  // "waypoints" and every handle on a curved edge sat beside the line it
  // claimed to hold. The anchors – M's pair, L's pairs, each C's last pair –
  // are the polyline the author wrote.
  const pts = [];
  for (const m of d.matchAll(/([MLC])([^MLCZ]+)/g)) {
    const nums = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (m[1] === 'C') {
      for (let i = 4; i + 1 < nums.length; i += 6) pts.push([nums[i], nums[i + 1]]);
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    }
  }
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
// them and selecting it would hand the panel something it cannot edit – every
// drag a silent no-op. The statement is what the gesture means, so that is
// what it selects.
function dgeOwnerOf(id) {
  const el = dgeFind(id);
  // A sequence's entries are the exception: each was written on a line of its
  // own, so clicking one selects it rather than the statement that stacked it.
  // Everything else an expanding statement draws – a chart column, a table
  // cell, a lifeline – selects the statement, because that is the only text
  // there is to edit.
  return el && el.synth && el.synth !== el.id && !el.entry ? el.synth : id;
}

// The other direction, and only interesting where it disagrees with dgeFind:
// an id that owns expanded elements but is not one. That is a `bars … series
// of X`, the one expanding statement that draws no frame, and the member is
// the only route to the line that wrote it – synthetic elements carry their
// statement's span exactly so that route exists.
function dgeSynthOwner(id, model) {
  const m = model || DGE.model;
  if (!m || dgeFind(id, m)) return null;
  return [...m.nodes, ...m.edges].find((e) => e.synth === id && e.span) || null;
}

function dgeHitTest(pt, opts) {
  if (!DGE.boxes) return null;
  const hits = [];
  for (const [id, b] of DGE.boxes) {
    if (pt.x < b.x || pt.x > b.x + b.w || pt.y < b.y || pt.y > b.y + b.h) continue;
    const el = dgeFind(id);
    if (!el) continue;
    // An edge has a box now – the bounding box of its route, which is what
    // makes `w1.cy` a coordinate – and it is the wrong shape to hit-test
    // against: mostly empty paper wherever the line runs diagonally, and of
    // *zero* area wherever it runs straight, so it sorted in front of every
    // real box below and swallowed the clicks meant for them. A line is found
    // by dgeNearestEdge, which measures the distance to the stroke, and
    // `edges: false` has to mean what it says – the edge tool used it to
    // guarantee it never names an arrow as an endpoint.
    if (el.kind === 'edge') continue;
    hits.push({ id: dgeOwnerOf(id), area: b.w * b.h, el });
  }
  hits.sort((a, b) => a.area - b.area);
  const box = hits[0] || null;
  if (opts && opts.edges === false) return box ? box.id : null;
  // Reading order settles the ties, because it is what the author sees: a box
  // wins over an arrow that crosses it, and an arrow wins over the container
  // or brace it runs through. Without the second half every edge inside a
  // container would be unreachable, which is most of them.
  //
  // A statement's frame counts as a holder here, and that is what a sequence
  // needs: its frame is a .bare .clear box the size of the whole figure, so
  // it enclosed every message and won every click meant for one. The clause
  // is written as "an arrow that is not this frame's own", so a chart's
  // baseline still selects the chart – it belongs to the frame, and clicking
  // a part of a statement means the statement.
  const edge = dgeNearestEdge(pt);
  const edgeOwner = edge ? dgeOwnerOf(edge) : null;
  if (edgeOwner && (!box || box.el.kind === 'container' || box.el.kind === 'brace'
    || (box.el.frame && edgeOwner !== box.id))) return edgeOwner;
  return box ? box.id : null;
}

// ── canvas interaction ──────────────────────────────────────────────

// A double-click on a handle cannot be recognised the two obvious ways. The
// first click ends a zero-length drag, whose gestureEnd repaints the guide
// layer – so the second click lands on a *different DOM node* carrying the
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

// The browser can take a pointer away mid-gesture – alt-tab, a system
// gesture, a stylus leaving range – and it says so with pointercancel, not
// pointerup. Ignoring it left the move/up listeners armed, so the *next*
// pointerup anywhere committed a preview the author had abandoned. One
// wiring for every gesture: up commits, cancel aborts.
function dgeWireGesture(move, up, abort) {
  const off = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  };
  const onUp = (e) => { off(); up(e); };
  const onCancel = () => { off(); (abort || up)(); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

// A gesture that planned edits and wrote nothing. dgeResolveEdits skips an
// attribute with no span, so a plan can be resolved down to no splices at all
// while the status bar still shows the line it meant to write – the editor
// reporting an edit that never happened, which is the failure the last review
// closed in three other places. Every editing gesture ends through this, so a
// construct nobody has thought of yet says so rather than looking dead.
function dgeSayNothingWritten(planned) {
  if (!planned || !planned.edits || !planned.edits.length) return;
  if (planned.refusals && planned.refusals.length) return;
  dgeStatus('', 'Nothing in the source changed – there is no token on that line for this '
    + 'drag to rewrite. The line is in the source pane below.', true);
}

// What a cancelled *editing* gesture leaves behind: the source as it was at
// pointerdown, painted again. dgeGestureEnd recompiles, so putting the bytes
// back is the whole job.
function dgeAbortEdit(ctx) {
  DGE.strain = null;
  dgeSnapGuides = [];
  if (ctx && DGE.source !== ctx.source) DGE.source = ctx.source;
  dgeGestureEnd();
  dgeDrawGuides();
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
  };
  dgeWireGesture(move, up, up);
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
  // And *stop*. Saying the table is stale and then handing it out anyway is
  // the very state this check exists to catch: DGE.spans describes the last
  // text that compiled, DGE.source is the text on screen, so every splice the
  // drag plans lands at an offset that has moved. That is how two more
  // gestures turned an attribute tail into `{.a}.b}.c}` while the canvas never
  // changed, because the block never compiled again.
  if (DGE.spansFor !== DGE.source) {
    dgeStatus('', 'This block does not compile, so there is nothing to drag against – undo, or fix the line the message names.', true);
    return null;
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

// Four places to drop a dragged element on the thing under the pointer.
//
// Deliberately no modifier. Ctrl/Cmd already suspends snapping and Alt leaves
// an align set; a third would be a lot to hold, and Shift means axis-constrain
// in every drawing tool. The commitment here is *releasing on a chip*, which
// nobody does by accident – so the gesture guards itself and stays reachable
// with one hand.
//
// The host is found from the pointer, not from the dragged element, and its
// geometry comes from the layout as it was at pointerdown. Both matter: the
// element is moving under the preview, and the layout is re-solved on every
// move, so anything read from the live state would slide about while it is
// being aimed at.
// Would docking on this host close a loop? The compiler answers
// `placement cycle: …` and dgeSetSource puts the edit back, but by then the
// author has aimed at a chip that was never going to work, and the preview
// lied to them while they did. Cheaper not to offer it: a host that can
// already reach the dragged element – through its own placement, a `same as`,
// or by holding it – is not a host.
function dgeReaches(model, from, target, seen) {
  if (from === target) return true;
  if (!from || seen.has(from)) return false;
  seen.add(from);
  const el = dgeFind(from, model);
  if (!el) return false;
  const next = [];
  const p = el.place;
  if (p && p.kind === 'rel') next.push(p.ref);
  else if (p && p.kind === 'between') for (const r of p.refs || []) next.push(r.ref);
  else if (p && p.kind === 'abs') for (const c of (p.at || [])) if (c && c.ref) next.push(c.ref);
  if (el.sameAs) next.push(el.sameAs);
  for (const m of el.members || []) next.push(m);
  return next.some((x) => dgeReaches(model, x, target, seen));
}

function dgeDockAt(ctx, id, pt) {
  // Only a node's statement can carry a placement. An edge, container or
  // brace has no slot for one, so the chip would promise a dock and the
  // release would splice `left of c gap 0.4` into a line that cannot hold it.
  // dgePlacementPane is gated the same way; this used to not be.
  if (!ctx.boxes || !ctx.model.nodes.some((x) => x.id === id)) return null;
  const r = dgeGrabTolerance(13);     // chip radius, constant on screen
  const off = dgeGrabTolerance(22);   // how far outside the edge it sits
  const reach = off + r * 2;
  let host = null, area = Infinity;
  for (const [hid, b] of ctx.boxes) {
    // Through the owner, like dgeHitTest: a `bars`, `grid` or `plot` expands
    // into elements no line of the source declares, so the cell under the
    // pointer has to answer with the statement that made it. Without this a
    // hover wrote `left of g-2-1` while a click on the same pixel selected g.
    const owner = dgeOwnerOf(hid);
    if (owner === id) continue;
    const el = dgeFind(owner, ctx.model);
    if (!el || el.kind === 'edge') continue;
    if (dgeReaches(ctx.model, owner, id, new Set())) continue;
    // Expanded, so the chips stay live once the pointer has left the box to
    // reach for one. Innermost wins, as everywhere else.
    if (pt.x < b.x - reach || pt.x > b.x + b.w + reach) continue;
    if (pt.y < b.y - reach || pt.y > b.y + b.h + reach) continue;
    if (b.w * b.h < area) { area = b.w * b.h; host = { id: owner, b }; }
  }
  if (!host) return null;
  const { b } = host;
  const chips = [
    { dir: 'left', x: b.x - off, y: b.y + b.h / 2 },
    { dir: 'right', x: b.x + b.w + off, y: b.y + b.h / 2 },
    { dir: 'above', x: b.x + b.w / 2, y: b.y - off },
    { dir: 'below', x: b.x + b.w / 2, y: b.y + b.h + off },
  ];
  const chip = chips.find((c) => Math.abs(pt.x - c.x) <= r && Math.abs(pt.y - c.y) <= r) || null;
  const out = { host: host.id, box: b, chips, r, chip: null };
  if (!chip) return out;
  // The distance is not what a chip is for. Measuring it from where the
  // pointer happens to be gives a gap of nearly zero every time – the chip
  // sits just outside the edge, and half the dragged element covers the rest –
  // so the element would end up flush against the host, which nobody means by
  // "dock it here". The chip says *which side*; the distance is whatever the
  // element already kept, and dragging adjusts it afterwards.
  // Keep the distance the element already kept – but only if the author
  // actually wrote one. Every `rel` placement carries a default gap, so
  // testing the model would re-emit 0.25 as an explicit token on a line that
  // never had it, in an editor whose whole design is rewriting the smallest
  // span it can.
  const written = ctx.spans.spanOf(id, 'gap');
  const el = dgeFind(id, ctx.model);
  const gap = (written && written.present && el && el.place && el.place.kind === 'rel')
    ? el.place.gap : DGE_DOCK_GAP;
  out.chip = chip.dir;
  out.text = dgePlaceText(chip.dir, host.id, gap);
  // A relation cannot win an axis a set already owns: the align would keep
  // overriding it and the element would land on the master instead of beside
  // the host it was dropped on, while the status bar promised otherwise.
  // Docking is explicit enough to mean leaving the set.
  out.leaves = [];
  for (const axis of ['x', 'y']) {
    const owner = ctx.spans.constrainedBy(id, axis);
    if (owner) out.leaves.push(owner);
  }
  out.why = 'docks it ' + (chip.dir === 'left' || chip.dir === 'right' ? chip.dir + ' of ' : chip.dir + ' ')
    + host.id + ' – release here and it follows ' + host.id + ' from now on';
  return out;
}

function dgeDockNodes(dock) {
  if (!dock) return [];
  const out = [dgeEl('rect', {
    class: 'dge-dock-host', x: dock.box.x - 2, y: dock.box.y - 2,
    width: dock.box.w + 4, height: dock.box.h + 4, rx: 3,
  })];
  for (const c of dock.chips) {
    out.push(dgeEl('rect', {
      class: 'dge-dock' + (c.dir === dock.chip ? ' dge-dock-on' : ''),
      x: c.x - dock.r, y: c.y - dock.r, width: dock.r * 2, height: dock.r * 2, rx: 2,
    }));
  }
  return out;
}

function dgeStartMove(ev, pt0) {
  if (!DGE.selection.length) return;
  const id = DGE.selection[0];
  const ctx = dgeGestureBase();
  if (!ctx) return;
  const { uw, uh } = dgeUnits(ctx.model);
  let last = null;
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    const dx = (pt.x - pt0.x) / uw, dy = (pt.y - pt0.y) / uh;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) return;
    if (DGE.beat > 0) {
      // In a beat, the same drag means something else: the element's
      // placement is the opening picture and must not move, so this writes
      // a `move` into the step instead. The whole selection, not the grabbed
      // element alone – a marquee dragged at a beat used to move only what
      // the pointer happened to be on. Nodes only: an edge or a container
      // follows what it is attached to, in a step as everywhere else.
      const ids = (DGE.selection.includes(id) ? DGE.selection : [id]).filter((sid) => {
        const e = dgeFind(sid, ctx.model);
        return e && ['box', 'dot', 'text', 'image'].includes(e.kind);
      });
      if (!ids.length) return;
      // The same guides as beat 0, on the same terms: one element, because
      // each guide names one statement, and `move @tag to …` is refused by the
      // compiler for the same reason. What changes is only the token they land
      // in – `move x to <relation>` instead of the placement itself.
      const gd = ids.length === 1
        ? dgeGuideSnap(ctx, ids[0], dx, dy, { free: e.ctrlKey || e.metaKey, beat: DGE.beat })
        : { dx, dy, snap: null, nodes: [] };
      dgeSnapGuides = gd.nodes;
      const to = gd.snap && gd.snap.to;
      const plans = ids.map((sid) => dgeStepMove(ctx, sid, gd.dx, gd.dy,
        (to && sid === ids[0]) ? to : null)).filter(Boolean);
      if (!plans.length) return;
      // Numbered, because a whole selection dragged into a step that has no
      // ops yet gives every element the same insertion point – and dgeSplice's
      // tie-break is what makes them land in the order they were planned
      // rather than in whatever order the sort happened to leave them.
      DGE.source = dgeSplice(ctx.source,
        plans.flatMap((p) => p.splices).map((sp, i) => ({ ...sp, seq: i })));
      last = { edits: [{ attr: 'move' }], refusals: [] };
      dgeRecompile();
      const line = plans.length === 1 ? plans[0].line : `${plans.length} move ops`;
      const into = `into step "${DGE.model.steps[DGE.beat - 1].name}" – the opening picture is untouched`;
      dgeStatus(line, to ? gd.snap.why + ' · ' + into : into);
      return;
    }
    // Docking beats moving: while the pointer is on one of the four chips the
    // preview shows the element already there, so the picture answers "what
    // will this do" before the button comes up. Only a single selection – it
    // is one placement expression, and four chips cannot say where three
    // elements go.
    const dock = DGE.selection.length === 1 ? dgeDockAt(ctx, id, pt) : null;
    dgeSnapGuides = dgeDockNodes(dock);
    if (dock && dock.chip) {
      const edits = [{ attr: 'place', value: dock.text, why: dock.why }];
      for (const owner of dock.leaves) {
        const rest = owner.members.filter((m) => m !== id);
        const text = dgeStatementText(owner, rest);
        edits.push(text === null
          ? { raw: dgeLineRange(ctx.source, owner.span), value: '' }
          : { raw: owner.span, value: text });
      }
      const plan = {
        edits,
        refusals: [],
        why: dock.leaves.length ? dock.why + ', and leaves the set on line '
          + dock.leaves.map((o) => o.line).join(' and ') : dock.why,
      };
      DGE.strain = null;
      last = plan;
      plan.edits[0].why = plan.why;
      DGE.source = dgeApplyEdits(ctx, id, plan.edits);
      dgeRecompile();
      dgeShowPlan(ctx, id, plan);
      return;
    }
    // The neighbour guides (§9.2). Only for a single selection – each of
    // them names one statement, and four elements would each want a
    // different one – and only while no dock chip is armed: a chip under the
    // pointer is already a decision, and two proposals on screen at once is
    // one too many. The unarmed chips stay drawn beside a guide, because
    // neither of them is a commitment yet.
    const guide = DGE.selection.length === 1
      ? dgeGuideSnap(ctx, id, dx, dy, { free: e.ctrlKey || e.metaKey })
      : { dx, dy, snap: null, nodes: [] };
    dgeSnapGuides = [...dgeSnapGuides, ...guide.nodes];
    const res = dgeMoveSelection(ctx, guide.dx, guide.dy,
      { free: e.ctrlKey || e.metaKey, leave: e.altKey, snap: guide.snap });
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
    DGE.strain = null;
    dgeSnapGuides = [];
    if (DGE.source !== ctx.source) {
      const done = DGE.source;
      DGE.source = ctx.source;
      dgeSetSource(done);
    } else dgeSayNothingWritten(last);
    dgeGestureEnd();
    if (last && last.refusals.length) dgeNote(last.refusals[0], true);
  };
  dgeWireGesture(move, up, () => dgeAbortEdit(ctx));
}

function dgeStartResize(ev, id, handle) {
  const pt0 = dgePointToDiagram(ev);
  const ctx = dgeGestureBase();
  if (!ctx) return;
  const { uw, uh } = dgeUnits(ctx.model);
  let last = null;
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    const free = e.ctrlKey || e.metaKey;
    const guide = dgeResizeSnap(ctx, id, (pt.x - pt0.x) / uw, (pt.y - pt0.y) / uh, handle, { free });
    dgeSnapGuides = guide.nodes;
    const plan = dgePlanResize(ctx, id, guide.dw, guide.dh, handle, { snap: guide.snap, free });
    last = plan;
    DGE.source = dgeApplyEdits(ctx, id, plan.edits);
    dgeRecompile();
    dgeShowPlan(ctx, id, plan);
  };
  const up = () => {
    dgeSnapGuides = [];
    if (DGE.source !== ctx.source) { const done = DGE.source; DGE.source = ctx.source; dgeSetSource(done); }
    else dgeSayNothingWritten(last);
    dgeGestureEnd();
  };
  dgeWireGesture(move, up, () => dgeAbortEdit(ctx));
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
  if (!ctx) return;
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
  // How the endpoint is written today, read once: the source is fixed for the
  // gesture, and asking again on every pointermove would tokenize the line
  // sixty times a second for an answer that cannot change.
  const was = String((dgeSpanIn(ctx, id, which) || {}).text || '').split(',');

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
    // Empty paper, so a coordinate – but in the units the endpoint is already
    // written in. A point inside a plot is written `roc@0.35`, a value in the
    // data rather than a position on the page, and answering a drag with grid
    // cells changed the units under the author without saying so. Per
    // component, because half an endpoint can be plotted and half of it not.
    const cell = [dgeNum(dgeRound(pt.x / uw, DGE_SNAP_CELL)), dgeNum(dgeRound(pt.y / uh, DGE_SNAP_CELL))];
    const comp = (axis, i) => {
      const m = DGE_PLOT_RE.exec(was[i] || '');
      return (m && dgePlotValueAt(ctx, m[1], axis, i === 0 ? pt.x : pt.y)) || cell[i];
    };
    const value = comp('x', 0) + ',' + comp('y', 1);
    const inPlot = value !== cell.join(',');
    return { value, why: `${which} ${value} – an endpoint in empty space, `
      + (inPlot ? 'in the plot’s own units' : 'which stays put when things move') };
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
    dgeSnapGuides = [];
    if (DGE.source !== ctx.source) { const done = DGE.source; DGE.source = ctx.source; dgeSetSource(done); }
    dgeGestureEnd();
  };
  dgeWireGesture(move, up, () => dgeAbortEdit(ctx));
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
// A waypoint's own neighbour guides. Same rule as a placement's and the same
// two answers per axis, because it is the same coordinate grammar: a
// component that already holds a reference keeps it and only its nudge moves,
// and a bare number that lands on another element's line becomes `iv.cx`.
// Plot coordinates stay out of it, the way they stay out of the move guides –
// `roc@0.35` names a value in the data, which is a better relation than
// anything a guide can propose about the paper.
//
// A waypoint costs no dependency edge – edges are drawn after every box is
// placed – so there is no cycle to refuse here; dgeGuideHosts is still what
// answers, because a synthetic name from a chart is no more nameable from a
// `via` than it is from an `at`.
// Which halves of one waypoint are written in a plot's own units – the same
// question dgePlotted asks of a placement, and cached the same way, because it
// is two tokenizes and the answer cannot change while the pointer is down.
function dgeViaPlotted(ctx, id, k) {
  const key = id + '/' + k;
  if (ctx.viaPlottedFor === key) return ctx.viaPlotted;
  const test = (axis) => {
    const sp = dgeSpanIn(ctx, id, `via.${k}.${axis}`);
    return !!(sp && sp.present && DGE_PLOT_RE.test(sp.text));
  };
  ctx.viaPlottedFor = key;
  ctx.viaPlotted = { x: test('x'), y: test('y') };
  return ctx.viaPlotted;
}

function dgeWaypointSnap(ctx, id, k, at, dx, dy, opts) {
  const none = { dx, dy, snap: null, nodes: [] };
  if (!at || (opts && opts.free)) return none;
  const el = dgeFind(id, ctx.model);
  const pair = el && (el.via || [])[k];
  if (!pair) return none;
  const { uw, uh } = dgeUnits(ctx.model);
  const unit = { x: uw, y: uh };
  const live = { x: Math.abs(dx) > DGE_GUIDE_DEAD, y: Math.abs(dy) > DGE_GUIDE_DEAD };
  if (!live.x && !live.y) return none;
  const want = { x: at[0] + dx * uw, y: at[1] + dy * uh };
  const out = { dx, dy, nodes: [], snap: { at: {}, why: '' } };
  const why = [];
  for (const axis of ['x', 'y']) {
    const i = axis === 'x' ? 0 : 1;
    if (!live[axis]) continue;
    if (dgeViaPlotted(ctx, id, k)[axis]) continue;
    const c = pair[i];
    let best = null;
    if (c && c.ref) {
      const hb = ctx.boxes.get(c.ref);
      if (!hb) continue;
      const line = dgeLineAt(hb, axis, c.prop);
      if (Math.abs(line - want[axis]) > DGE_GUIDE_CELL * unit[axis]) continue;
      best = { host: c.ref, prop: c.prop, line, held: true };
    } else {
      for (const h of dgeGuideHosts(ctx, id)) {
        for (const prop of DGE_GUIDE_PROPS[axis]) {
          const line = dgeLineAt(h.b, axis, prop);
          const d = Math.abs(line - want[axis]);
          if (d > DGE_GUIDE_CELL * unit[axis]) continue;
          const better = !best || d < best.dist - 1e-6
            || (d < best.dist + 1e-6 && prop === DGE_GUIDE_PROPS[axis][0]);
          if (better) best = { host: h.id, prop, line, dist: d, held: false };
        }
      }
    }
    if (!best) continue;
    if (axis === 'x') out.dx = (best.line - at[0]) / uw; else out.dy = (best.line - at[1]) / uh;
    want[axis] = best.line;
    if (!best.held) out.snap.at[axis] = best.host + '.' + best.prop;
    why.push(best.held
      ? `back on ${best.host}.${best.prop}`
      : `${best.host}.${best.prop} – on ${best.host}'s ${DGE_PROP_WORD[best.prop]}`);
    out.nodes.push(...dgeGuideVia(ctx, best, axis, want));
  }
  if (!why.length) return none;
  out.snap.why = why.join(' · ');
  return out;
}

// The line the waypoint has landed on, drawn through the element that owns it
// and the point itself, and labelled with what would be written.
function dgeGuideVia(ctx, part, axis, want) {
  const hb = ctx.boxes.get(part.host);
  if (!hb) return [];
  const label = part.host + '.' + part.prop;
  if (axis === 'x') {
    const lo = Math.min(hb.y, want.y) - 16, hi = Math.max(hb.y + hb.h, want.y) + 16;
    return [dgeGuideMark('line', { x1: part.line, y1: lo, x2: part.line, y2: hi }),
      dgeGuideLabel(part.line + 4, lo - 4, label)];
  }
  const lo = Math.min(hb.x, want.x) - 16, hi = Math.max(hb.x + hb.w, want.x) + 16;
  return [dgeGuideMark('line', { x1: lo, y1: part.line, x2: hi, y2: part.line }),
    dgeGuideLabel(hi + 4, part.line - 4, label)];
}

function dgePlanWaypoint(ctx, id, k, dx, dy, free, guide) {
  const el = dgeFind(id, ctx.model);
  const pair = el && (el.via || [])[k];
  if (!pair) return { edits: [], refusals: [] };
  const snap = (v) => (free ? v : dgeRound(v, DGE_SNAP_CELL));
  const edits = [];
  for (const [axis, i, delta] of [['x', 0, dx], ['y', 1, dy]]) {
    // A guide that found a line writes even where the snap put the point back
    // exactly where it started – the same trade the placement guides make.
    // The author asked for the relation, not for the displacement.
    const named = guide && guide.at[axis];
    if (!delta && !named) continue;
    const c = pair[i];
    if (c && c.ref) {
      // Same reading as a placement: a waypoint written in a plot's units has
      // no nudge token, so the value is what a drag moves.
      if (!delta) continue;
      const plotted = dgePlotCoordEdit(ctx, id, `via.${k}.${axis}`, axis, delta, free);
      if (plotted) { edits.push(plotted); continue; }
      const next = snap((c.nudge || 0) + delta);
      edits.push({
        attr: `via.${k}.${axis}.nudge`,
        value: next === 0 ? '' : (next > 0 ? '+' : '') + dgeNum(next),
        why: `keeps ${c.ref}.${c.prop}`,
      });
    } else {
      // A bare number, and a guide may have found a line the grammar can name
      // where it lands. `iv.cx` rather than the number it resolves to today is
      // the whole difference between this and a drawing tool's smart guides,
      // and once it is there the nudge branch above keeps it.
      edits.push({ attr: `via.${k}.${axis}`,
        value: named || dgeNum(snap((c ? c.unit : 0) + delta)),
        why: named ? guide.why : undefined });
    }
  }
  return { edits, refusals: [] };
}

function dgeStartWaypoint(ev, id, k) {
  const pt0 = dgePointToDiagram(ev);
  const ctx = dgeGestureBase();
  if (!ctx) return;
  const { uw, uh } = dgeUnits(ctx.model);
  // Where the waypoint sits before anything moves, read off the drawn line
  // once. The preview redraws it on every pointermove, so asking again mid
  // gesture would measure each delta against a position the last one moved.
  const pts0 = dgeEdgePts(id);
  const at = pts0 && pts0[k + 1] ? pts0[k + 1] : null;
  let last = null;
  const move = (e) => {
    const pt = dgePointToDiagram(e);
    const free = e.ctrlKey || e.metaKey;
    const guide = dgeWaypointSnap(ctx, id, k, at,
      (pt.x - pt0.x) / uw, (pt.y - pt0.y) / uh, { free });
    dgeSnapGuides = guide.nodes;
    const plan = dgePlanWaypoint(ctx, id, k, guide.dx, guide.dy, free, guide.snap);
    last = plan;
    DGE.source = dgeApplyEdits(ctx, id, plan.edits);
    dgeRecompile();
    dgeShowPlan(ctx, id, plan);
  };
  const up = () => {
    dgeSnapGuides = [];
    if (DGE.source !== ctx.source) { const done = DGE.source; DGE.source = ctx.source; dgeSetSource(done); }
    else dgeSayNothingWritten(last);
    dgeGestureEnd();
  };
  dgeWireGesture(move, up, () => dgeAbortEdit(ctx));
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
      // Edges have boxes now, and a marquee must still not sweep them up. A
      // marquee means "move these together", and an edge is the one thing that
      // cannot be moved - it follows its ends. Including them would put an
      // element that refuses into most selections, so every marquee drag would
      // answer with a refusal sentence about something the author never aimed
      // at. Clicking an arrow still selects it.
      const el = dgeFind(id);
      if (el && el.kind === 'edge') continue;
      if (b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h) inside.push(id);
    }
    // Through dgeSelect, which resolves each id to the statement that wrote it.
    // Assigning the raw list here was the one path that put a chart's columns
    // and a table's cells into the selection.
    dgeSelect(inside);
  };
  const up = () => {
    dgeSnapGuides = [];
    dgeDrawGuides();
  };
  dgeWireGesture(move, up, () => { dgeSnapGuides = []; dgeDrawGuides(); });
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
      // A file the server listed is not in this page's asset table – the
      // page was built before anything referenced it. Register it as
      // pending, exactly like a freshly uploaded file, or the in-browser
      // compiler refuses the line the pick is about to write and the picker
      // reports a placement that was in fact rolled back.
      const pick = () => {
        DGE.fig.images = DGE.fig.images || {};
        if (!DGE.fig.images[a.id]) DGE.fig.images[a.id] = { aspect: 1, markup: '', pending: true };
        choose(a.id, { note: dgeAssetNote(a.file) + ' It appears on the next build.' });
      };
      const btn = row(a.id, `assets/${a.file} · ${Math.round(a.bytes / 1024)} KB`, null);
      btn.onclick = pick;
      list.insertBefore(btn, anchor);
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
      // writes is already correct – it just needs the file to arrive. The
      // in-browser compiler needs the reference registered first, though, or
      // it refuses that very line and the "already written" claim is false.
      dgeRegisterPending(`assets/${name}`, name, String(reader.result)).then(() => {
        choose(`assets/${name}`, { note: `Copy ${f.name} into assets/ beside source.md; the line is already written. ` + dgeAssetNote(name) });
      });
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
  // Only say "written" when it stuck – dgeSetSource reverts a line the
  // compiler refuses and has already named the problem in the status bar,
  // and overwriting that with a success message was a lie on top of it.
  if (dgeSetSource(lines.join('\n'))) dgeStatus(line, 'written');
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
  dgeWireGesture(move, up, () => { dgeSnapGuides = []; dgeDrawGuides(); });
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

// Through the owner, exactly as the hit test resolves a click. A `bars`,
// `grid`, `plot`, `table` or `lanes` expands into elements no line of the
// source declares, and two controls used to hand those ids straight over: the
// marquee, which reads DGE.boxes, and the tag legend, whose `t-row-0` and
// `t-col-1` are tags the compiler generates over the cells. Selected, a cell
// opened a full panel – placement, size, every swatch – in which nothing
// whatsoever could be written, because createSpanTable refuses a span for a
// synthetic member. A dead panel where a click had just worked is worse than a
// refusal, and the statement is what the gesture meant anyway.
//
// Deduplicated on the way through, or a marquee over a twelve-column chart
// selects the same statement twelve times and the panel says "12 selected".
function dgeSelect(ids) {
  const seen = new Set();
  DGE.selection = [];
  for (const id of ids) {
    const owner = dgeOwnerOf(id);
    if (seen.has(owner)) continue;
    seen.add(owner);
    DGE.selection.push(owner);
  }
  dgeRenderSide();
  dgeDrawGuides();
  dgeRenderTools();
}

function dgeRenderSide() {
  const side = dgeQ('#dge-side');
  if (!side || !DGE.model) return;
  side.replaceChildren();

  // The beat first, and above the empty-selection branch: it describes the
  // step rather than an element, so "nothing selected" is exactly the moment
  // an author most needs to be told what this beat is for.
  if (DGE.beat) side.appendChild(dgeStepPane());

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

  // A statement that expanded into elements and drew no frame of its own: a
  // `bars … series of X` puts its columns in the chart it joined. Every field
  // below would have nothing to write to, and the swatch rows would answer a
  // click by doing nothing at all – so say what it is, count what it drew, and
  // offer the chart that carries the geometry.
  if (DGE.selection.length === 1 && !single) {
    const member = dgeSynthOwner(DGE.selection[0]);
    if (member) {
      const id = DGE.selection[0];
      const line = DGE.source.slice(member.span[0], member.span[1]);
      const toks = window.PSI_DG.dgTokenize(line, 0);
      // The compiler records the statement now, so the chart it joined is read
      // off the model rather than counted out of the tokens. The scan stays as
      // the fallback: a series is the only statement carrying one of these
      // records today, and a panel that went blank the day a second one
      // arrived would be a poor way to find that out.
      const statement = dgeLineOwner(id);
      const host = toks.findIndex((x) => !x.q && !x.attr && x.v === 'series');
      const chart = (statement && statement.series)
        || (host >= 0 && toks[host + 2] ? toks[host + 2].v : null);
      let n = 0;
      while (dgeFind(window.PSI_DG.dgBarName(id, n))) n++;
      side.appendChild(dgeEl('h3', { class: 'dge-sel-head',
        text: (toks[0] ? toks[0].v : 'statement') + ' ' + id }));
      side.appendChild(dgeEl('div', { class: 'dge-empty', html:
        'A series draws columns in a frame it does not own, so it has no box of its own to '
        + 'select, drag or resize.<br><br>' + n + ' column(s)'
        + (chart ? ', in the frame of <b>' + dgeEscapeHtml(chart) + '</b>' : '')
        + '.<br><br>Its values and its look are the one line below; the width, the height and '
        + 'the spacing belong to the chart.' }));
      if (chart && dgeFind(chart)) {
        side.appendChild(dgeEl('div', { class: 'dge-chips' }, [
          dgeEl('button', {
            type: 'button', class: 'dge-chip', text: 'Select ' + chart,
            onclick: () => dgeSelect([chart]),
          }),
        ]));
      }

      // Which chart it joined. The charts in a block are a **closed list** –
      // every `bars` frame declared above this line – and a closed list is
      // this codebase's own criterion for a control rather than a field. It
      // used to be a text edit for want of a span; `series of <chart>` has one
      // now, the token after `of`, and replacing that one token retargets the
      // run in a single splice.
      //
      // Only the charts declared *above* it: the compiler refuses "names no
      // chart above it", and a swatch that can only come back as a refusal is
      // not a control. The current one reads as pressed, and a block with one
      // chart still shows the row – with nothing else to offer, it is the
      // panel saying what this run belongs to.
      const owner = statement || {};
      const charts = DGE.model.nodes.filter((n) => n.frame === 'bars'
        && (!n.synth || n.synth === n.id)
        && (owner.line == null || n.line < owner.line));
      const seriesSp = dgeSpanOf(id, 'series');
      if (seriesSp && charts.length) {
        const row = dgeEl('div', { class: 'dge-swatches' });
        for (const c of charts) {
          row.appendChild(dgeEl('button', {
            type: 'button', class: 'dge-sw',
            'aria-pressed': String(c.id === chart),
            title: 'series of ' + c.id,
            text: c.id,
            onclick: () => dgeWriteAttr(id, 'series', c.id),
          }));
        }
        side.appendChild(dgeEl('div', {}, [
          dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'series of' }), row]),
          dgeEl('div', { class: 'dge-hint', text:
            'The chart whose frame these columns are drawn in. Its ticks, its scale and its '
            + 'geometry; this line brings the values and the look.' }),
        ]));
      }

      // Everything on the line, now that it has one. A series used to carry
      // no span-table entry at all – it names no element, so `createSpanTable`
      // had nothing to key it by – which left its values, its classes, its
      // tags and `stacked` reachable only by typing into the source pane. The
      // compiler pushes a record onto `model.statements` for it now, so every
      // control below is the ordinary one, asking the ordinary question.
      const valSp = dgeSpanOf(id, 'values');
      if (valSp) {
        side.appendChild(dgeEl('div', {}, [
          dgeEl('h3', { text: 'values' }),
          dgeEl('input', {
            type: 'text', value: valSp.present ? valSp.value : '',
            placeholder: '12,15,19,24',
            onchange: (e) => dgeWriteAttr(id, 'values', e.target.value.trim(), true),
          }),
          dgeEl('div', { class: 'dge-hint', text:
            'One number per column, and the count has to match the chart it joined – '
            + 'the ticks and the scale are that chart\u2019s.' }),
        ]));
      }

      // Side by side or piled up: one word, and it changes the scale of the
      // whole chart rather than only this run. A closed choice of two, so it
      // is a swatch row for the same reason `point` and a brace’s `side`
      // are – and the row names both readings, because "stacked" off is not
      // "nothing", it is the other one.
      const stackSp = dgeSpanOf(id, 'stacked');
      if (stackSp) {
        const row = dgeEl('div', { class: 'dge-swatches' });
        for (const [word, label] of [['', 'side by side'], ['stacked', 'stacked']]) {
          row.appendChild(dgeEl('button', {
            type: 'button', class: 'dge-sw',
            'aria-pressed': String((stackSp.present ? 'stacked' : '') === word),
            title: word ? 'stacked' : 'no stacked on the line',
            text: label,
            onclick: () => dgeWriteAttr(id, 'stacked', word),
          }));
        }
        side.appendChild(dgeEl('div', {}, [
          dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'grouping' }), row]),
          dgeEl('div', { class: 'dge-hint', text:
            'Stacked puts this run on top of the one before it, and the scale becomes the '
            + 'tallest stack rather than the tallest single value.' }),
        ]));
      }

      // Exactly the two options a series takes. The rest of what
      // DG_KIND_OPTS lists for a `bars` line – w, h, space, aspect – belong to
      // the chart it joined and the compiler says so, so they are not fields
      // here rather than fields that answer with a refusal.
      const marks = dgeEl('div', { class: 'dge-nums' });
      for (const key of ['emph', 'calm']) {
        const span = dgeSpanOf(id, key);
        marks.appendChild(dgeEl('label', { class: 'dge-num dge-num-wide' }, [
          dgeEl('span', { text: key }),
          dgeEl('input', {
            type: 'text',
            value: span && span.present ? span.value : '',
            placeholder: DGE_LIST_HINT[key],
            title: DGE_LIST_HINT[key],
            onchange: (e) => dgeWriteAttr(id, key, e.target.value
              .split(',').map((x) => x.trim()).filter(Boolean).join(',')),
          }),
        ]));
      }
      side.appendChild(dgeEl('div', {}, [
        dgeEl('h3', { text: 'marked columns' }), marks,
        dgeEl('div', { class: 'dge-hint', text:
          'Column numbers, counted from 0, marked from the opening beat. A number this '
          + 'run has no column for is a build error, not a mark that quietly misses.' }),
      ]));

      // The class rows, offered for a box: that is what a column is, and the
      // classes on this line are what describes it.
      side.appendChild(dgeSlotRows(
        [{ kind: 'box', classes: statement ? statement.classes : [] }], new Set(['box'])));
      side.appendChild(dgeTagPane());
      side.appendChild(dgeTagLegend());
      side.appendChild(dgeElementList());
      side.appendChild(dgeSourcePane());
      return;
    }
  }

  const head = dgeEl('div', {}, [
    dgeEl('h3', { class: 'dge-sel-head',
      text: single ? `${single.entry || single.kind} ${single.id}` : `${DGE.selection.length} selected` }),
  ]);
  // The way back to the statement. Clicking an entry used to select the whole
  // sequence, which is how its own options were reached; now that a click
  // lands on the entry, the frame carries w / h / space / unnumbered and
  // nothing on the canvas selects it, because it is drawn .bare .clear and
  // has no ink to hit. Its own class, per the rule chips follow: waypoints,
  // tags and a step's ops all render as .dge-chip, and a selector naming only
  // that picks whichever pane comes first in the DOM.
  if (single && single.entry && dgeFind(single.synth)) {
    head.appendChild(dgeEl('div', { class: 'dge-chips' }, [
      dgeEl('button', {
        type: 'button', class: 'dge-chip dge-chip-owner',
        text: 'part of sequence ' + single.synth,
        title: 'select the statement – its own rhythm, size and numbering live there',
        onclick: () => dgeSelect([single.synth]),
      }),
    ]));
  }
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
    // No span, no field. That is a `bars`, `grid` or `plot` frame, which has
    // no label at all – and whose first quoted token is its values or an axis
    // title, so a field here would have edited those under the wrong name.
    const sp = DGE.spans.spanOf(single.id, 'label');
    if (sp) {
      const input = dgeEl('textarea', {
        rows: 2, text: sp.present ? sp.value : '',
        placeholder: 'label',
        onchange: (e) => { dgeWriteAttr(single.id, 'label', e.target.value, true); dgeBeatNote(); },
      });
      side.appendChild(dgeEl('div', {}, [
        dgeEl('h3', { text: 'label' }), input,
        dgeEl('div', { class: 'dge-hint', text: 'Enter breaks the line · ⌘S applies and writes back' }),
      ]));
    }
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
      dgeEl('div', { class: 'dge-hint', text: single.entry
        ? 'A message runs between two actors of this sequence, by the names their actor lines '
          + 'give them. A coordinate here is not one of them and the line will not compile.'
        : 'A name follows the element when it moves; x,y stays put. '
          + 'Add an anchor with a dot – mix.right – and a fraction along it with a colon – mix.right:0.3.' }),
      // The rule was legible nowhere in the editor: it is not in the panel, and
      // the drawing cannot show it, because an edge that follows its ends looks
      // exactly like an edge someone remembered to write a show for.
      dgeEl('div', { class: 'dge-hint', text:
        'An edge is on screen whenever both its ends are, so it needs no show of its own. '
        + 'Naming it in a step overrides that in both directions.' }),
    ]));

    // Waypoints. Listed rather than only draggable, because how many there are
    // and which of them holds a reference is not readable off the picture: a
    // waypoint written iv.cx,d0.bottom+0.28 and one written 1.4,2.06 land in
    // exactly the same place and behave completely differently afterwards.
    // Not on a sequence message. Its waypoints are the loop a self-message
    // draws, generated by the statement, and the line has nowhere to write a
    // `via` - so every chip here would have been a click the compiler refuses.
    const via = single.entry ? null : (single.via || []);
    const wrap = dgeEl('div', {});
    if (via) {
    wrap.appendChild(dgeEl('h3', { text: 'waypoints' }));
    if (!via.length) {
      wrap.appendChild(dgeEl('div', { class: 'dge-hint', text: dgeCurveOf(single) === 'elbow'
        ? 'None – .elbow draws its own two waypoints, a rail halfway across the gap on '
          + 'whichever axis the ends are further apart. An edge cannot carry both, so take '
          + 'the class off to bend it by hand.'
        : 'None – the arrow runs straight. Drag one of the hollow dots on the line to bend it.' }));
    } else {
      const list = dgeEl('div', { class: 'dge-chips' });
      via.forEach((pair, k) => {
        const sp = DGE.spans.spanOf(single.id, 'via.' + k);
        const held = pair.some((c) => c && c.ref);
        list.appendChild(dgeEl('button', {
          // A class of its own, because "the chips in the panel" is not a set:
          // waypoints, tags and a step's ops all render as chips, and a
          // selector that says only `.dge-chip` picks whichever pane happens
          // to come first in the DOM.
          type: 'button', class: 'dge-chip dge-chip-via' + (held ? ' dge-chip-held' : ''),
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
    }
    side.appendChild(wrap);
  }

  // Where it sits, as the three things a placement actually says: which kind
  // of relation, what it is measured from, and how far. A drag can say how
  // far and, since it learned to re-dock, which side – but which *element*
  // and which *kind* were only ever reachable by editing the text, and they
  // are the parts that carry the meaning. `between a,b` in particular has no
  // gesture at all: nothing about dragging one box says "halfway between
  // those two".
  if (single && !single.entry && DGE.model.nodes.some((x) => x.id === single.id)) {
    side.appendChild(dgePlacementPane(single));
  }

  // The tokens a statement identifies by position rather than by a keyword:
  // a chart's values, a grid's shape and cell kind, a plot's axis titles, an
  // image's asset. Named fields rather than "the second string on the line",
  // because that is the only form in which they are learnable – and each one
  // says what it counts, so a values/labels mismatch is visible here instead
  // of arriving later as a compiler error.
  if (single) side.appendChild(dgeDataPane(single));

  // Which way a pointed outline aims, offered only where there is a point to
  // aim. `none` takes the option back off the line and the shape returns to
  // its default direction.
  if (single && !single.entry) {
    const aimable = dgeAimOf(single);
    if (aimable) {
      const dirs = [...window.PSI_DG.DG_POINT_DIRS];
      const row = dgeEl('div', { class: 'dge-swatches' });
      for (const dir of ['', ...dirs]) {
        row.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-sw',
          'aria-pressed': String((single.point || '') === dir),
          title: dir ? 'point ' + dir : 'the outline’s own direction',
          text: dir || 'default',
          onclick: () => dgeWriteAttr(single.id, 'point', dir),
        }));
      }
      side.appendChild(dgeEl('div', {}, [
        dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'aim' }), row]),
        dgeEl('div', { class: 'dge-hint', text:
          'Which way the .' + aimable + ' points. An option on the line, not a class, '
          + 'so one word covers every direction.' }),
      ]));
    }
  }

  // The one bare word a sequence's own statement reads. A closed list of one,
  // so it is the checkbox `stacked` on a series already is: present as a token
  // or absent as an insertion point, and nothing to type.
  if (single && single.frame === 'sequence') {
    const sp = dgeSpanOf(single.id, 'unnumbered');
    if (sp) {
      const row = dgeEl('div', { class: 'dge-swatches' });
      for (const [word, label] of [['', 'numbered'], ['unnumbered', 'no numbers']]) {
        row.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-sw',
          'aria-pressed': String((sp.present ? 'unnumbered' : '') === word),
          text: label,
          onclick: () => dgeWriteAttr(single.id, 'unnumbered', word),
        }));
      }
      side.appendChild(dgeEl('div', {}, [
        dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'numbering' }), row]),
        dgeEl('div', { class: 'dge-hint', text:
          'The column of numbers left of the frame. The number in the drawing and the index in '
          + 'the tag are the same number, so message 4 is the one @' + single.id + '-msg-3 names.' }),
      ]));
    }
  }

  // Which side of its members a brace stands on. A closed word list, so it is a
  // swatch row for the same reason `point` is one – and it was the only word in
  // the grammar that moves an element bodily with no control at all.
  if (single && single.kind === 'brace') {
    const sp = dgeSpanOf(single.id, 'side');
    const now = sp && sp.present ? sp.value : '';
    const row = dgeEl('div', { class: 'dge-swatches' });
    for (const which of ['', ...window.PSI_DG.DG_BRACE_SIDES]) {
      row.appendChild(dgeEl('button', {
        type: 'button', class: 'dge-sw',
        'aria-pressed': String(now === which),
        title: which ? 'the spine on the ' + which : 'whatever the defaults say',
        text: which || 'default',
        onclick: () => dgeWriteAttr(single.id, 'side', which),
      }));
    }
    side.appendChild(dgeEl('div', {}, [
      dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: 'side' }), row]),
      dgeEl('div', { class: 'dge-hint', text:
        'Which side of its members the brace stands on, and so which side its '
        + 'label sits on. How far off them it stands is pad, below.' }),
    ]));
  }

  // Geometry: exactly the options that element's own statement accepts.
  if (single) {
    const opts = dgeKindOpts(single);
    if (opts.length) {
      const row = dgeEl('div', { class: 'dge-nums' });
      for (const key of opts) {
        // A comma list, not a number. Four of the five layers `dgeResolve`
        // walks are `default` blocks, and no `default` carries one of these –
        // so there is nothing inherited to show as a placeholder, and "auto"
        // would say nothing about what to type. The hint says it instead.
        const list = window.PSI_DG.DG_LIST_OPTS.has(key);
        const span = dgeSpanOf(single.id, key);
        const resolved = list ? { value: null } : dgeResolve(single, key);
        row.appendChild(dgeEl('label', { class: 'dge-num' + (list ? ' dge-num-wide' : '') }, [
          dgeEl('span', { text: key }),
          dgeEl('input', {
            type: 'text',
            value: span && span.present ? span.value : '',
            placeholder: list ? DGE_LIST_HINT[key] : (resolved.value === null ? 'auto' : dgeNum(resolved.value)),
            title: list ? DGE_LIST_HINT[key] : null,
            // Spaces around the commas are the one mistake this field invites
            // and the one the tokenizer cannot survive: `emph 1, 3` splits into
            // two tokens and the second is reported as an unexpected word. Take
            // them out on the way in rather than answering a reasonable
            // keystroke with the compiler's refusal.
            onchange: (e) => dgeWriteAttr(single.id, key, list
              ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean).join(',')
              : e.target.value.trim()),
          }),
        ]));
      }
      side.appendChild(dgeEl('div', {}, [dgeEl('h3', { text: 'size' }), row,
        dgeProvenance(single, opts.filter((k) => !window.PSI_DG.DG_LIST_OPTS.has(k)))]));
    }
  }

  // The closed class vocabulary, one row per slot, and the tag chips under it.
  side.appendChild(dgeSlotRows(DGE.selection.map((id) => dgeFind(id)).filter(Boolean)));
  side.appendChild(dgeTagPane());

  // Acts on the selection. These were built long before the panel had room
  // to say what they do: they were six buttons reading `x left` and `y top`,
  // and a `spread x`, which is the statement's own spelling rather than the
  // question anyone arrives with. Same statements, named the way they would
  // be looked for.
  if (DGE.selection.length >= 2) {
    const block = dgeEl('div', {}, [
      dgeEl('h3', { text: 'line them up' }),
      dgeEl('div', { class: 'dge-empty', text:
        `${DGE.selection[0]} is the master – it keeps its place and the rest follow.` }),
    ]);
    for (const [axis, label, edges] of [
      ['x', 'across', [['left', 'left edges'], ['center', 'centres'], ['right', 'right edges']]],
      ['y', 'down', [['top', 'top edges'], ['middle', 'middles'], ['bottom', 'bottom edges']]],
    ]) {
      const row = dgeEl('div', { class: 'dge-chips' });
      for (const [edge, text] of edges) {
        row.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-btn', text,
          title: `align ${axis} ${edge} ${DGE.selection.join(', ')}`,
          onclick: () => dgeAlign(axis, edge),
        }));
      }
      block.appendChild(dgeEl('div', { class: 'dge-slot' }, [dgeEl('b', { text: label }), row]));
    }
    if (DGE.selection.length >= 3) {
      const row = dgeEl('div', { class: 'dge-chips' });
      for (const [axis, text] of [['x', 'across'], ['y', 'down']]) {
        row.appendChild(dgeEl('button', {
          type: 'button', class: 'dge-btn', text,
          title: `spread ${axis} – equal distance between centres. `
            + `${DGE.selection[0]} and ${DGE.selection[DGE.selection.length - 1]} stay put.`,
          onclick: () => dgeSpread(axis),
        }));
      }
      block.appendChild(dgeEl('div', { class: 'dge-slot' }, [
        dgeEl('b', { text: 'even spacing' }), row]));
    }
    // `between a,b` has no gesture – nothing about dragging one box says
    // "halfway between those two" – so it is a selection act, the same idiom
    // container and brace already use. First selected is the one that moves.
    // Only a node's statement can hold a placement, so only a node can be put
    // halfway. And note the reversal: everywhere else in this block the first
    // selected keeps its place, here it is the one that moves – the subtitle
    // above says the opposite, so this row says its own piece.
    if (DGE.selection.length === 3 && DGE.model.nodes.some((x) => x.id === DGE.selection[0])) {
      const [who, a, z] = DGE.selection;
      block.appendChild(dgeEl('div', { class: 'dge-slot' }, [
        dgeEl('b', { text: 'halfway' }),
        dgeEl('div', {}, [
          dgeEl('div', { class: 'dge-chips' }, [
            dgeEl('button', {
              type: 'button', class: 'dge-btn', text: `put ${who} between ${a} and ${z}`,
              title: `between ${a},${z} – and it stays halfway when either of them moves`,
              onclick: () => dgeWriteAttr(who, 'place', `between ${a},${z}`),
            }),
          ]),
          dgeEl('div', { class: 'dge-hint', text:
            `This one moves ${who} – the other two stay where they are. `
            + 'Select the one to move first.' }),
        ]),
      ]));
    }
    side.appendChild(block);
  }

  side.appendChild(dgeTagLegend());
  side.appendChild(dgeElementList());
  side.appendChild(dgeSourcePane());
}

// The closed class vocabulary, one row per slot. Lifted out of dgeRenderSide
// because the `series of` branch returns before it and needs the same rows:
// a series carries no element, but its classes land on the columns it draws,
// and those are boxes like any other. `kinds` is what the rows are offered
// *for* – the selection's own kinds normally, and `box` for a series, because
// that is the kind the classes on that line end up describing.
function dgeSlotRows(chosen, kinds) {
  const slots = dgeEl('div', {});
  slots.appendChild(dgeEl('h3', { text: 'look' }));
  const on = kinds || new Set(chosen.map((el) => el.kind));
  for (const slot of DGE_SLOTS) {
    if (slot.kinds && ![...on].some((k) => slot.kinds.includes(k))) continue;
    const current = dgeSlotValue(slot);
    const row = dgeEl('div', { class: 'dge-swatches' });
    // A slot every one of whose real options is out of reach here – the two
    // alignment rows on an edge, where only the pair across the line can pick
    // a side – would come out as a single "none of this" swatch, pressed and
    // unclickable. That is a row asking a question with one answer, so it is
    // not a row.
    if (!slot.options.some((o) => o.cls && (!o.when || chosen.some((el) => o.when(el))))) continue;
    for (const opt of slot.options) {
      // An option narrower than its slot. Hidden rather than disabled: the row
      // is a closed list of what this selection can be, and a greyed swatch
      // reads as "not yet" rather than "not here". `dgeSlotValue` and
      // `dgeSetSlot` still know the whole slot, so a `.diamond` written by
      // hand is still displaced when another outline is picked.
      if (opt.when && !chosen.some((el) => opt.when(el))) continue;
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
  return slots;
}

// Tags. Membership is the one piece of structure that is completely
// invisible in the drawing, so it is a first-class control here.
function dgeTagPane() {
  const chips = dgeEl('div', { class: 'dge-chips' });
  const mine = new Set();
  for (const id of DGE.selection) for (const t of (dgeLineOwner(id) || {}).tags || []) mine.add(t);
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
  return dgeEl('div', {}, [dgeEl('h3', { text: 'tags' }), chips]);
}

// Which class of a slot the selection carries. Mixed selections show none
// pressed rather than lying about a shared value.
function dgeSlotValue(slot) {
  const names = slot.options.map((o) => o.cls).filter(Boolean);
  let found;
  for (const id of DGE.selection) {
    const el = dgeLineOwner(id);
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
    const el = dgeLineOwner(id);
    if (!el) continue;
    // Arrowheads are the arrow token's business, not a class's. `--` IS
    // "none", so the row rewrites the token – picking "none" writes `--`,
    // picking "one" or "both" restores `->` – and only `.both-heads` is a
    // class at all. Editing the class alone left `--` in the line, the
    // parser re-derived `no-head` on top of `.both-heads`, and "both" came
    // out as one reversed head.
    if (slot.key === 'head') {
      if (el.kind !== 'edge') continue;
      const arrowSp = DGE.spans.spanOf(id, 'arrow');
      const cur = arrowSp && arrowSp.present ? arrowSp.value : '->';
      const want = cls === 'no-head' ? '--' : (cur === '--' ? '->' : cur);
      if (arrowSp && arrowSp.present && want !== cur) {
        splices.push({ start: arrowSp.start, end: arrowSp.end, text: want, seq: 0 });
      }
      const keep = (el.classes || []).filter((c) => !names.includes(c));
      if (cls === 'both-heads') keep.push(cls);
      const tail = dgePlanTail(id, { classes: keep });
      if (tail) splices.push({ ...tail, seq: 1 });
      continue;
    }
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
  // that is not in the source – the opposite of what happened, on top of the
  // compiler's own refusal.
  if (applied && widened.length) {
    dgeStatus('', 'wrote ' + widened.join(', ') + ' as well – .' + cls
      + ' fits the type to the box, so the box has to say how wide it is.', false);
  } else if (applied) dgeBeatNote();
}

function dgeToggleTag(tag, add) {
  const next = dgeApplySplices(DGE.selection.map((id) => {
    const el = dgeLineOwner(id);
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
  if (!dgeKindOpts(el).includes("w")) return null;
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
  const el = dgeLineOwner(id);
  if (!el) return null;
  const isEdge = el.kind === 'edge';
  const parts = [];
  const wantId = changes.id !== undefined ? changes.id : (isEdge && !/^edge-\d+$/.test(el.id) ? el.id : null);
  if (wantId) parts.push('#' + wantId);
  // A class the parser derived from the statement itself – `no-head` on a
  // `--` edge – is not the author's and must not be written back: every tail
  // rebuild on such a line used to grow a `.no-head` the arrow token already
  // says.
  const auto = new Set(el.autoClasses || []);
  for (const c of (changes.classes !== undefined ? changes.classes : el.classes || [])) {
    if (!auto.has(c)) parts.push('.' + c);
  }
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
  // that covers `{...}` while its value is only what is between them – so
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
  // an offset – a width and an attribute tail both go at the end of a line
  // that has neither – and applying right to left means the one applied
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

// `col`, `emph` and `calm` are keyword options like `w` or `space`, but their
// value is a comma list rather than one number – and `DG_KEYED_ATTRS`, the
// list `spanOf` scans for a keyword, does not carry them. So `spanOf` answers
// null for all three, and the fields the panel derives from `DG_KIND_OPTS`
// refused every keystroke with a sentence about placements.
//
// Resolved here in the meantime, in exactly the shape `spanOf` hands back, so
// no caller branches. **This belongs in `DG_KEYED_ATTRS`**: the day those three
// names join it, `spanOf` answers first and this function goes dark – delete
// it then rather than leaving two readings of one line.
function dgeListSpan(ctx, id, attr) {
  // Through dgeLineOwner, not dgeFind: `emph 3 calm 0` is as legal on a
  // `series of` line as on the chart it joined, and that line has no element.
  const el = dgeLineOwner(id, ctx.model);
  if (!el || !el.span) return null;
  const src = ctx.source;
  const toks = window.PSI_DG.dgTokenize(src.slice(el.span[0], el.span[1]), el.span[0]);
  // The two guards spanOf uses, for the reason it uses them: `col` is a
  // perfectly good element name, so the kind word and the element's own name
  // are never keywords, and neither is a token sitting in a reference slot.
  const REF_INTRO = new Set(['of', 'below', 'above', 'as', 'over', 'between', '->', '<-', '--']);
  const k = toks.findIndex((x, i) => i >= 2 && !x.q && !x.attr && x.v === attr
    && !(toks[i - 1] && !toks[i - 1].q && !toks[i - 1].attr
      && (REF_INTRO.has(toks[i - 1].v) || toks[i - 1].v.endsWith(','))));
  if (k >= 0 && toks[k + 1]) {
    const t = toks[k + 1];
    return { start: t.s, end: t.e, prefix: '', suffix: '', present: true,
             text: src.slice(t.s, t.e), value: t.v };
  }
  // Where a new one goes: in front of the attribute tail when there is one,
  // like every other trailing option, because `bars b "…" {.tone-1} emph 1`
  // reads like a mistake and the author has to live in this file.
  const tail = toks.find((x) => x.attr);
  let at = el.span[1];
  if (tail) { at = tail.s; while (at > el.span[0] && /\s/.test(src[at - 1])) at--; }
  return { start: at, end: at, prefix: ' ' + attr + ' ', suffix: '',
           present: false, text: '', value: '' };
}

// Which side of its members a brace sits on: `brace b over a,z right "…"`. A
// bare word off a closed list, like `stacked` on a chart, so createSpanTable
// has no entry for it – and with no span there was no control, which left the
// one option that decides where a brace *is* reachable only by typing.
//
// The word is the first token after the member list, and the list is what
// makes this worth a shim rather than a scan: `over a,b` is one token and
// `over a, b` is two, so the run has to be walked rather than counted. A
// member actually named `right` cannot be mistaken for the side, because the
// token before it then carries the comma that keeps it inside the run.
function dgeSideSpan(ctx, id) {
  const el = dgeFind(id, ctx.model);
  if (!el || el.kind !== 'brace' || !el.span) return null;
  const src = ctx.source;
  const toks = window.PSI_DG.dgTokenize(src.slice(el.span[0], el.span[1]), el.span[0]);
  const bare = toks.filter((x) => !x.q && !x.attr);
  const over = bare.findIndex((x) => x.v === 'over');
  if (over < 0 || !bare[over + 1]) return null;
  let k = over + 1;
  while (k + 1 < bare.length && bare[k].v.endsWith(',')) k++;
  const after = bare[k + 1];
  if (after && window.PSI_DG.DG_BRACE_SIDES.includes(after.v)) {
    return { start: after.s, end: after.e, prefix: '', suffix: '', present: true,
             text: src.slice(after.s, after.e), value: after.v };
  }
  // Where a new one goes: straight after the members, which is where the
  // grammar reads it and where anyone writing the line by hand would put it.
  const at = bare[k].e;
  return { start: at, end: at, prefix: ' ', suffix: '', present: false, text: '', value: '' };
}

// One question, two callers: the panel asks it against DGE, a gesture against
// the state it started from (dgeGestureBase). Both carry a source, a model and
// a span table under those names, so neither has to know about the shims.
function dgeSpanIn(ctx, id, attr) {
  const sp = ctx.spans.spanOf(id, attr);
  if (sp) return sp;
  if (window.PSI_DG.DG_LIST_OPTS.has(attr)) return dgeListSpan(ctx, id, attr);
  if (attr === 'side') return dgeSideSpan(ctx, id);
  return null;
}
const dgeSpanOf = (id, attr) => dgeSpanIn(DGE, id, attr);

function dgeWriteAttr(id, attr, value, quoted) {
  const sp = dgeSpanOf(id, attr);
  if (!sp) {
    dgeStatus('', `${attr} cannot be written on ${id} here – give it a placement first.`, true);
    return;
  }
  // Nothing to clear. Without this the insert branch below writes the
  // keyword with no value after it - ` point ` - which the compiler refuses,
  // so clicking the already-selected "default" swatch answered a no-op click
  // with a red refusal.
  if (!value && !sp.present && attr !== 'label') return;
  let next;
  if (!value && sp.present && attr !== 'label') {
    let start = sp.start;
    const m = DGE.source.slice(0, start).match(new RegExp('\\s+' + attr + '\\s+$'));
    // A positional token has no keyword in front of it to eat, so the run of
    // spaces that separated it stays behind and the line grows a double space
    // every time one is dropped. Take that run instead.
    const gapBefore = m || DGE.source.slice(0, start).match(/[ \t]+$/);
    if (gapBefore) start -= gapBefore[0].length;
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

// The beat you are standing on: what it is called, what it does, and the four
// acts that make up almost every step anyone writes.
//
// `style`, `label` and `move` are deliberately not buttons here. Each already
// has a control that means the same thing in context – a swatch, the label
// field, a drag – and a second way to reach them would be a second thing to
// learn for nothing.
function dgeStepPane() {
  const k = DGE.beat - 1;
  const step = DGE.model.steps[k];
  const wrap = dgeEl('div', {});
  if (!step) return wrap;

  wrap.appendChild(dgeEl('h3', { text: 'this step' }));
  wrap.appendChild(dgeEl('div', { class: 'dge-nums' }, [
    dgeEl('label', { class: 'dge-num dge-num-wide' }, [
      dgeEl('span', { text: 'name' }),
      dgeEl('input', {
        type: 'text', value: step.name,
        title: 'shown on the beat bar, and in the speaker’s next-up hint',
        onchange: (e) => dgeRenameStep(k, e.target.value),
      }),
    ]),
  ]));

  // What the beat does, resolved rather than read off the source – a `show
  // @attack` is one op and nine elements, and the nine are what the room
  // sees. Clicking one selects it.
  const changes = dgeStepChanges(DGE.beat);
  const does = dgeEl('div', { class: 'dge-chips' });
  if (!changes.size) {
    does.appendChild(dgeEl('span', { class: 'dge-hint', text:
      'Nothing changes here yet. Select an element and use a button below.' }));
  } else {
    for (const [id, verb] of changes) {
      does.appendChild(dgeEl('button', {
        type: 'button', class: 'dge-chip' + (DGE.selection.includes(id) ? ' dge-chip-held' : ''),
        html: dgeEscapeHtml(id) + '<span class="dge-verb">' + verb + '</span>',
        title: 'select ' + dgeOwnerOf(id),
        onmouseenter: () => { DGE.hoverId = id; dgeDrawGuides(); },
        onmouseleave: () => { DGE.hoverId = null; dgeDrawGuides(); },
        // Through the owner, like the hit test and the element list. A beat
        // changes `f-2` because `show f` named the chart, and selecting the
        // column would open a panel with nothing in it: an expanded element
        // has no line of source, so every field answers "cannot be written".
        onclick: () => dgeSelect([dgeOwnerOf(id)]),
      }));
    }
  }
  wrap.appendChild(does);

  // The acts, on the selection.
  const acts = dgeEl('div', { class: 'dge-chips' });
  const sel = DGE.selection.slice();
  for (const [op, why] of [['show', 'bring in'], ['hide', 'take away'],
    ['emph', 'emphasise'], ['calm', 'push back']]) {
    acts.appendChild(dgeEl('button', {
      type: 'button', class: 'dge-chip', text: op,
      disabled: !sel.length,
      title: sel.length ? why + ' ' + sel.join(', ') + ' in this step'
        : 'select an element first',
      onclick: () => dgeAddStepOp(op, sel),
    }));
  }
  wrap.appendChild(acts);

  // The ops as written, so what the source says and what the beat does can be
  // compared – they are not the same list, and that is the point.
  if (step.ops.length) {
    const list = dgeEl('div', { class: 'dge-chips' });
    step.ops.forEach((op, i) => {
      list.appendChild(dgeEl('button', {
        type: 'button', class: 'dge-chip',
        html: dgeEscapeHtml(DGE.source.slice(op.span[0], op.span[1])) + '<span class="dge-x">×</span>',
        title: 'remove this line from the step',
        onclick: () => dgeRemoveStepOp(i),
      }));
    });
    wrap.appendChild(dgeEl('div', { class: 'dge-hint', text: 'written here:' }));
    wrap.appendChild(list);
  }

  // What the mode does and does not cover. The drag is the only gesture that
  // knows about the beat; the swatches and the label field below write on the
  // element's own line, which is the opening picture – and if this step or a
  // later one styles or relabels the same element, the canvas here goes on
  // showing that instead. Said plainly, because the sentence that used to sit
  // here ("Restyle and relabel with the controls below") read as a promise that
  // they wrote into the step, and a swatch that visibly does nothing is the
  // worst way to learn otherwise.
  wrap.appendChild(dgeEl('div', { class: 'dge-hint', text:
    'A drag at this beat writes a move into the step rather than changing where '
    + 'the element is placed. The look and the label below are not part of the '
    + 'step: they edit the opening picture, and a style or label op still wins '
    + 'over them here. Write one with a step line of its own.' }));
  return wrap;
}

// Said after a look or label edit made while standing on a beat. The edit went
// somewhere the canvas may not show, so the status bar has to name where.
function dgeBeatNote() {
  if (!DGE.beat || !DGE.model || !DGE.model.steps[DGE.beat - 1]) return;
  dgeStatus('', 'Written on the element\u2019s own line, which is the opening picture \u2013 not '
    + 'into step \u201c' + DGE.model.steps[DGE.beat - 1].name + '\u201d. A style or label op in '
    + 'this or an earlier step still wins over it here.', false);
}

// The positional tokens, per statement, as named fields. Each entry is the
// span name, the word the panel shows, and a hint – and `count`, where the
// value is a list whose length has to agree with another one. That number is
// the whole point of the pane: `bars` with twelve values and eleven labels is
// a hard error at build time, and the only way to see it coming is to be told
// both counts while typing.
//
// `empty` is what an emptied field means, and it is not "take the token out".
// These tokens are identified by *where* they sit, so removing one promotes
// whatever follows it into its slot: clearing a plot's x axis title left the y
// title reading as the x title, silently, with a figure that still compiled.
// So a field either keeps its slot as an empty string, or is refused outright
// where its statement cannot do without it. Only the last of a run may
// actually go.
const DGE_DATA_FIELDS = {
  bars: [
    { key: 'values', label: 'values', hint: 'numbers separated by commas · one per column',
      empty: 'refuse',
      count: (v) => v.split(',').filter((s) => s.trim()).length },
    { key: 'ticks', label: 'labels', hint: 'separated by spaces · one per column, or leave empty',
      empty: 'drop',
      count: (v) => v.trim().split(/\s+/).filter(Boolean).length },
  ],
  grid: [
    { key: 'shape', label: 'shape', hint: 'columns × rows, written 8x12', empty: 'refuse' },
    // Not "cell": the size row already has a `cell`, which is how wide one is,
    // and two fields under one word in one panel is a coin toss over which the
    // author is editing. This one is what each cell draws.
    { key: 'cellkind', label: 'cell kind', hint: 'box, dot or image – what each cell draws',
      empty: 'refuse' },
    { key: 'asset', label: 'asset', hint: 'the drawing each cell repeats', empty: 'refuse' },
  ],
  // A sequence message's second, smaller line. It is a data field rather than
  // a second label field because that is what it is positionally: the first
  // quoted string on the line is the label and `label` already resolves to it,
  // so two textareas both reading "label" would have been a coin toss over
  // which string an edit landed in - the trap a bars line taught.
  message: [
    { key: 'sub', label: 'second line',
      hint: 'the smaller line under the arrow – the payload, where the label is the name',
      empty: 'drop' },
  ],
  plot: [
    { key: 'xtitle', label: 'x axis', hint: 'the title under the horizontal axis',
      empty: (el) => ((DGE.spans.spanOf(el.id, 'ytitle') || {}).present ? 'blank' : 'drop') },
    { key: 'ytitle', label: 'y axis', hint: 'the title beside the vertical axis', empty: 'drop' },
  ],
};

// The list-valued options, and what each list is of. A placeholder reading
// "auto" is right for a number that a `default` might supply and wrong here,
// where nothing supplies one and the question is what to type.
const DGE_LIST_HINT = {
  col: 'one width per column · 1.5,0.9',
  emph: 'column numbers from 0 · 1,3',
  calm: 'column numbers from 0 · 0,2',
};

// How many of the thing its `h` measures a `table` or a `lanes` repeats.
// Counted off the elements the statement expanded into, through the
// compiler's own name generators, because that is the one reading that cannot
// disagree with the drawing – the source has the rows on separate lines and
// the lanes inside one string.
function dgeRepeatCount(el, model) {
  const { dgCellName, dgLaneName } = window.PSI_DG;
  const m = model || DGE.model;
  let n = 0;
  if (el.frame === 'table') while (dgeFind(dgCellName(el.id, 0, n), m)) n++;
  else if (el.frame === 'lanes') while (dgeFind(dgLaneName(el.id, n), m)) n++;
  return n;
}

// What a statement can be told about itself when it has no token an editor can
// address. A table's rows are quoted strings on lines of their own and a lane
// band's names are one string the span table calls nothing at all – handing
// either back as `label` is how a panel comes to overwrite a heading. So the
// pane says the *shape* of the thing, which is what the counts on a chart are
// for as well: a mismatch between the drawing and what the author meant is
// visible here rather than three beats later.
const DGE_DATA_SHAPE = {
  table: (el) => {
    const { dgCellName } = window.PSI_DG;
    let cols = 0;
    while (dgeFind(dgCellName(el.id, cols, 0))) cols++;
    return `${cols} column(s) × ${dgeRepeatCount(el)} row(s), the heading among them`
      + ' · the rows are the quoted lines under the statement';
  },
  lanes: (el) => `${dgeRepeatCount(el)} lane(s)`
    + ' · the names are the one quoted string on the statement, split on |',
};

function dgeDataPane(el) {
  const wrap = dgeEl('div', {});
  const fields = (el.frame || el.entry ? DGE_DATA_FIELDS[el.frame || el.entry]
    : (el.kind === 'image'
      ? [{ key: 'asset', label: 'asset', hint: 'the file this image draws', empty: 'refuse' }]
      : null)) || [];
  // A statement can have something true to say about its data without having
  // a token an editor may write – `table` and `lanes` are both – so the note
  // is its own answer rather than a property of the fields.
  const shape = el.frame && DGE_DATA_SHAPE[el.frame] ? DGE_DATA_SHAPE[el.frame](el) : null;
  if (!fields.length && !shape) return wrap;

  const rows = [];
  const counts = [];
  for (const f of fields) {
    const sp = DGE.spans.spanOf(el.id, f.key);
    // A field with no span is one this statement does not have – a `grid` of
    // boxes has no asset – so it is absent rather than empty. An empty box
    // the author cannot fill is worse than no box.
    if (!sp) continue;
    if (f.count) counts.push(f.label + ': ' + f.count(sp.present ? sp.value : ''));
    const quoted = f.key === 'values' || f.key === 'ticks'
      || f.key === 'xtitle' || f.key === 'ytitle' || f.key === 'sub';
    rows.push(dgeEl('label', { class: 'dge-num dge-num-wide' }, [
      dgeEl('span', { text: f.label }),
      dgeEl('input', {
        type: 'text', value: sp.present ? sp.value : '',
        placeholder: sp.present ? '' : 'none yet',
        title: f.hint,
        onchange: (e) => {
          const v = e.target.value.trim();
          // An emptied positional is not an attribute being dropped – see
          // DGE_DATA_FIELDS. Refused where the statement needs it, blanked
          // where something positional still follows it.
          const how = v ? null : (typeof f.empty === 'function' ? f.empty(el) : (f.empty || 'refuse'));
          if (how === 'refuse') {
            const kind = el.frame || el.kind;
            dgeStatus('', `${/^[aeiou]/.test(kind) ? 'An' : 'A'} ${kind} statement draws its `
              + `${f.label} – it cannot be left empty. Delete the element to take the line out.`, true);
            dgeRenderSide();
            return;
          }
          // Two quotes, written over the token rather than in place of it: the
          // slot has to stay, or whatever comes after it is read as this.
          if (how === 'blank') { dgeWriteAttr(el.id, f.key, '""'); return; }
          dgeWriteAttr(el.id, f.key, v, quoted);
        },
      }),
    ]));
  }
  if (!rows.length && !shape) return wrap;

  wrap.appendChild(dgeEl('h3', { text: 'data' }));
  if (rows.length) wrap.appendChild(dgeEl('div', { class: 'dge-nums' }, rows));
  // The asset picker, where there is an asset. Reused rather than rebuilt:
  // it is the one control that knows which references will still resolve
  // after the next build, and that is the hard part of naming a file.
  if (fields.some((f) => f.key === 'asset') && DGE.spans.spanOf(el.id, 'asset')) {
    wrap.appendChild(dgeEl('div', { class: 'dge-chips' }, [
      dgeEl('button', {
        type: 'button', class: 'dge-chip', text: 'Pick a file…',
        onclick: () => dgeOpenAssetPicker((asset) => {
          dgeWriteAttr(el.id, 'asset', asset.ref);
          if (asset.note) dgeStatus('', asset.note, false);
        }),
      }),
    ]));
  }
  // The mismatch line only where there is a mismatch to have. Labels are
  // optional – the field's own hint says "or leave empty" and the compiler
  // agrees – so a chart with none was being told its zero labels had to match
  // its twelve values.
  const nums = counts.map((c) => Number(c.split(': ')[1]));
  const mismatch = counts.length === 2 && nums[1] > 0 && nums[0] !== nums[1];
  const hint = counts.length
    ? counts.join(' · ') + (mismatch ? ' – these have to match' : '')
    : (shape || fields.map((f) => f.hint)[0]);
  wrap.appendChild(dgeEl('div', { class: 'dge-hint', text: hint }));
  return wrap;
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

  if (p.kind === 'abs') {
    // The coordinate itself, as text. A drag rewrites it and the kind row can
    // replace it, but until this field there was no way to *type* one – which
    // left the two constructs the grammar is proudest of, a borrowed
    // coordinate and a value in a plot's own units, reachable only by
    // dragging something that already had one.
    const sp = DGE.spans.spanOf(el.id, 'at');
    if (sp) {
      wrap.appendChild(dgeEl('div', { class: 'dge-nums' }, [
        dgeEl('label', { class: 'dge-num dge-num-wide' }, [
          dgeEl('span', { text: 'at' }),
          dgeEl('input', {
            type: 'text', value: sp.present ? sp.value : here(),
            onchange: (e) => {
              const v = e.target.value.trim();
              // Not a drop: an `at` with nothing after it is not a placement,
              // and the keyword left standing does not parse.
              if (!v) {
                dgeStatus('', 'A coordinate is two values separated by a comma – 1.5,2 – '
                  + 'or drop the placement with one of the other kinds above.', true);
                dgeRenderSide();
                return;
              }
              write('at ' + v);
            },
          }),
        ]),
      ]));
      wrap.appendChild(dgeEl('div', { class: 'dge-hint', text:
        'Two numbers, or another element’s coordinate – mix.cx+0.2, x0.cy – or a '
        + 'value in a plot’s own units – roc@0.35. Each half is read on its own, '
        + 'so one may borrow and the other be a number.' }));
    }
  } else if (p.kind === 'rel') {
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
          // Refuse what is not a number instead of silently writing 0 –
          // `Number('0.,4') || 0` collapsed a typo into "no gap at all".
          onchange: (e) => {
            const n = Number(e.target.value.trim());
            if (!e.target.value.trim() || !Number.isFinite(n)) {
              dgeStatus('', `"${e.target.value}" is not a number – the gap keeps its ${dgeNum(p.gap)}.`, true);
              dgeRenderSide();
              return;
            }
            write(dgePlaceText(p.dir, p.ref, n));
          },
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
        // Same refusal as the gap field: a typo is not the number 0.
        onchange: (e) => {
          const n = Number(e.target.value.trim());
          if (!e.target.value.trim() || !Number.isFinite(n)) {
            dgeStatus('', `"${e.target.value}" is not a number – frac keeps its ${dgeNum(p.frac)}.`, true);
            dgeRenderSide();
            return;
          }
          write(`between ${p.refs[0].ref},${p.refs[1].ref} frac ${dgeNum(n)}`);
        },
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
  // same holds for what a `bars`, `grid` or `plot` expands into – ninety-six
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
  // Shown even with no steps at all, because the way to get a first one is
  // the button on this bar. Hiding it was what made "the editor cannot add a
  // step" true: there was nowhere to ask.
  host.hidden = !DGE.model;
  if (!DGE.model) return;
  host.appendChild(dgeEl('span', { class: 'dge-cap', text: 'step' }));
  const chip = (k, label) => dgeEl('button', {
    type: 'button', class: 'dge-btn dge-beat', 'aria-pressed': String(k === DGE.beat),
    text: label, title: k === 0 ? 'the opening picture – a drag rewrites the placement'
      : `after step "${steps[k - 1].name}" – a drag writes a move into that step`,
    onclick: () => dgeSetBeat(k),
  });
  host.appendChild(chip(0, 'start'));
  steps.forEach((s, i) => host.appendChild(chip(i + 1, s.name)));
  host.appendChild(dgeEl('button', {
    type: 'button', class: 'dge-btn dge-beat-add',
    text: '+ step', title: 'add a beat at the end and stand on it',
    onclick: () => dgeAddStep(),
  }));
}

// A new step goes at the end, which is where a beat is almost always added –
// a figure is built up – and standing on it afterwards is the whole point:
// every control that writes into a step writes into the one you are on.
function dgeAddStep() {
  const n = (DGE.model ? DGE.model.steps.length : 0) + 1;
  const taken = new Set((DGE.model ? DGE.model.steps : []).map((s) => s.name));
  let name = 'step-' + n;
  for (let i = n; taken.has(name); i++) name = 'step-' + (i + 1);
  const src = DGE.source.replace(/\s*$/, '');
  dgeSetSource(src + '\nstep ' + name + '\n');
  // After the recompile, not before: the beat only exists once it parses.
  if (DGE.model && DGE.model.steps.length >= n) dgeSetBeat(DGE.model.steps.length);
}

// Dragging at a beat writes into the step, not into the placement. One
// `move … by` op per element per step: a second drag adds to the one that is
// already there rather than stacking two, which would be legal and unreadable.
// Writing an op into the step the beat is standing on. Same placement rule
// `dgeStepMove` uses – after the step's last op, or straight after the `step`
// line when it has none – so the source reads in the order the ops run.
function dgeAddStepOp(op, ids) {
  const step = DGE.model && DGE.model.steps[DGE.beat - 1];
  if (!step || !ids.length) return;
  const indent = (DGE.source.split('\n')[step.line] || '  ').match(/^\s*/)[0] || '  ';
  const at = step.ops.length ? step.ops[step.ops.length - 1].span[1] : step.span[1];
  const text = `${op} ${ids.join(', ')}`;
  dgeSetSource(DGE.source.slice(0, at) + '\n' + indent + text + DGE.source.slice(at));
  dgeStatus(text, 'written into step “' + step.name + '”');
}

function dgeRemoveStepOp(k) {
  const step = DGE.model && DGE.model.steps[DGE.beat - 1];
  const op = step && step.ops[k];
  if (!op) return;
  // Take the newline and indent in front of it too, or the step grows a blank
  // line every time an op comes off.
  let start = op.span[0];
  const lead = DGE.source.slice(0, start).match(/\n[ \t]*$/);
  if (lead) start -= lead[0].length;
  dgeSetSource(DGE.source.slice(0, start) + DGE.source.slice(op.span[1]));
}

// A step's name is the token after the keyword. Renaming is a splice inside
// the statement's own span, like every other structured edit here.
function dgeRenameStep(k, name) {
  const step = DGE.model && DGE.model.steps[k];
  if (!step) return;
  const clean = String(name).trim().replace(/\s+/g, '-');
  if (!/^[A-Za-z_][\w-]*$/.test(clean)) {
    dgeStatus('', 'A step name is letters, digits, _ and - , starting with a letter.', true);
    return;
  }
  const text = DGE.source.slice(step.span[0], step.span[1]);
  const m = text.match(/^(\s*step\s+)(\S+)/);
  const next = m
    ? DGE.source.slice(0, step.span[0]) + m[1] + clean + DGE.source.slice(step.span[0] + m[0].length)
    // `step` with no name at all: the parser gave it one, so write it out.
    : DGE.source.slice(0, step.span[1]) + ' ' + clean + DGE.source.slice(step.span[1]);
  dgeSetSource(next);
}

// A drag at a beat says one of two things about intent, and the status bar
// names which. **Snapped, it writes `move x to <relation>`** – the guide found
// a statement the grammar can hold, and a relation is worth more at a beat
// than anywhere else, because it goes on being true while the elements around
// it move through the rest of the talk. **Unsnapped, it writes
// `move x by dx,dy`**, a displacement and nothing more.
//
// One `move` op per element per step either way. A `to` supersedes a `by`
// rather than stacking in front of it: `to` clears the shift, so leaving the
// old `by` behind would be a line that reads as if it did something and does
// not.
function dgeStepMove(ctx, id, dx, dy, place) {
  const step = ctx.model.steps[DGE.beat - 1];
  if (!step) return null;
  const snap = (v) => dgeRound(v, DGE_SNAP_CELL);
  const mine = step.ops.filter((o) => o.op === 'move' && o.target === id);
  const indent = (ctx.source.split('\n')[step.line] || '  ').match(/^\s*/)[0] || '  ';
  // Where a new op goes: after the last op of the step, or straight after the
  // `step` line when it has none yet, so the source reads in the order the
  // ops run.
  const end = step.ops.length ? step.ops[step.ops.length - 1].span[1] : step.span[1];
  const write = (text) => {
    const keep = mine[0];
    // Taking an op off means taking the newline and the indent in front of it
    // too, the way dgeRemoveStepOp does, or the step grows a blank line every
    // time one goes.
    const splices = mine.slice(1).map((o) => {
      const lead = ctx.source.slice(0, o.span[0]).match(/\n[ \t]*$/);
      return { start: o.span[0] - (lead ? lead[0].length : 0), end: o.span[1], text: '' };
    });
    splices.push(keep
      ? { start: keep.span[0], end: keep.span[1], text }
      : { start: end, end, text: '\n' + indent + text });
    return { splices, line: text };
  };
  if (place) return write(`move ${id} to ${place}`);
  // A second unsnapped drag adds to the op already there rather than stacking
  // two, which would be legal and unreadable. Only onto a `by`: adding a
  // displacement to a `to` would mean rewriting a relation as a number, which
  // is the one trade this editor never makes on its own.
  const by = mine.find((o) => o.by);
  if (by) {
    const next = [snap(by.by[0] + dx), snap(by.by[1] + dy)];
    const text = `move ${id} by ${dgeNum(next[0])},${dgeNum(next[1])}`;
    return { splices: [{ start: by.span[0], end: by.span[1], text }], line: text };
  }
  const text = `move ${id} by ${dgeNum(snap(dx))},${dgeNum(snap(dy))}`;
  return { splices: [{ start: end, end, text: '\n' + indent + text }], line: text };
}

// ── what a step actually does ───────────────────────────────────────
//
// A step is a list of ops, and reading it tells you what the author *wrote*.
// It does not tell you what the beat *does*, and the two differ constantly:
// `show @attack` names one tag and brings in nine elements, an edge appears
// because both its ends did, a container appears because its members did. So
// the answer is a diff of the resolved state either side of the beat, not a
// reading of the source.
//
// This is what makes a step legible on the canvas: without it the only way to
// find out what a beat changes is to press Space and watch.
const DGE_VERBS = [
  ['appears', (a, b) => !a.visible && b.visible],
  ['goes', (a, b) => a.visible && !b.visible],
  ['emphasised', (a, b) => !a.classes.has('emph') && b.classes.has('emph')],
  ['calmed', (a, b) => !a.classes.has('dim') && b.classes.has('dim')],
  ['relabelled', (a, b) => a.label !== b.label],
  ['moves', (a, b) => a.shift[0] !== b.shift[0] || a.shift[1] !== b.shift[1] || a.place !== b.place],
  ['restyled', (a, b) => [...b.classes].join(' ') !== [...a.classes].join(' ')],
];

// The other half, and it cannot come from dgStateAt: an edge is only as
// visible as its two ends, a container as its members, a note as what it
// points at – and that rule resolves in dgFrameDrawables, into the frames
// payload, never into the state the ops produced. So the pane used to list
// the tag's members and nothing that arrived behind them: at lectures/diagrams
// #cbc, six chips for a beat that puts twelve things on the slide.
//
// Two verbs rather than one, because "came with its ends" is a different fact
// from "the author showed it", and an author reading the pane is entitled to
// know which lines they would have to change.
const DGE_DOWNHILL = { in: 'comes with its ends', out: 'goes with its ends' };

function dgeStepChanges(beat) {
  const out = new Map();
  if (!DGE.model || !beat || beat > DGE.model.steps.length) return out;
  const before = window.PSI_DG.dgStateAt(DGE.model, beat - 1);
  const after = window.PSI_DG.dgStateAt(DGE.model, beat);
  for (const [id, b] of after) {
    const a = before.get(id);
    if (!a) continue;
    // First verb that fits, not all of them: an element that appears has
    // every class it will ever have "gained", and listing that as a restyle
    // as well says nothing.
    const verb = DGE_VERBS.find(([, test]) => test(a, b));
    if (verb) out.set(id, verb[0]);
  }
  const fr = DGE.frames;
  if (fr && fr[beat] && fr[beat - 1]) {
    // The same threshold the hit test uses, so "on screen" means one thing in
    // the editor. A .ghost element sits at 0.45 and is on screen throughout.
    const on = (v) => (v == null ? true : v > 0.02);
    for (const id in fr[beat].vis) {
      const was = on(fr[beat - 1].vis[id]), now = on(fr[beat].vis[id]);
      if (was === now) continue;
      // A verb from the diff came from a line the author wrote about this
      // element in this step, and it keeps precedence: the pane sits beside
      // the ops as written, and an `emph feed0` with no effect chip against it
      // reads as a line that does nothing. The rule fills the elements the
      // diff had nothing at all to say about – at lectures/diagrams #cbc, the
      // three arrows that arrive because both their ends did.
      if (out.has(id)) continue;
      out.set(id, now ? DGE_DOWNHILL.in : DGE_DOWNHILL.out);
    }
  }
  return out;
}

// At a beat, the guides have to show both where the element is now and where
// it came from, or a `move` is invisible until you press Space. Two
// treatments, and which one ships is the open question in §12 – both are
// drawn so the choice can be made by looking rather than on paper.
function dgeDrawBeatGuides(g) {
  if (!DGE.beat || !DGE.model || !DGE.model.steps.length) return;
  const prev = dgeBoxesAt(DGE.model, DGE.beat - 1);
  const style = DGE.beatGuide || 'both';

  // Which elements this beat is *about*, marked on the drawing. A step's ops
  // do not answer that – `show @attack` is one line and nine elements – and
  // without the mark the only way to find out was to press Space and watch
  // for what moved. Drawn under the motion guides below so a moving element
  // gets both.
  for (const [id, verb] of dgeStepChanges(DGE.beat)) {
    const cls = 'dge-changed dge-changed-' + verb.replace(/\s+/g, '-');
    const b = DGE.boxes.get(id);
    let anchor = b;
    if (!b) {
      // layoutDiagram has no box for an edge, so an edge could never be
      // marked at all – not when a step named it, and not when it came in
      // behind its ends. Trace the painted line instead.
      const pts = dgeEdgePts(id);
      if (!pts) continue;
      g.appendChild(dgeEl('polyline', {
        class: cls, points: pts.map(p => p.join(',')).join(' '),
      }));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      anchor = { x: Math.min(...xs), y: Math.min(...ys) };
    } else {
      const pad = 3;
      g.appendChild(dgeEl('rect', {
        class: cls,
        x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, rx: 4,
      }));
    }
    if (DGE.hoverId === id) {
      g.appendChild(dgeEl('text', {
        class: 'dge-changed-tag', x: anchor.x, y: anchor.y - 7, text: verb,
      }));
    }
  }
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
  if (!ctx) return;
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
  // digits, _ and – only.
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
// window. The DOM half – swapping the drawing, its frames payload, the step
// runtime and the focus-card clone – is dgSwapFigure in the shared diagram
// runtime, one text with the no-editor receiver's path so the two cannot
// drift. What stays here is the compile.
function dgeApplyToPage(fig, body) {
  const res = dgeCompile(fig, body);
  if (!res.ok) return false;
  const next = window.dgSwapFigure(fig.svg, res.html);
  if (!next) return false;
  fig.svg = next;
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

// Edits made while the projection is frozen, latest source per figure. Held
// back rather than dropped: speaker.md promises "unfreeze, and the room gets
// the finished picture", and until this queue existed the thaw sent only the
// navigation snapshot – the room kept the old figure until some later edit
// happened to be committed while live.
const dgePendingEdits = new Map();

function dgeEditMessage(fig, source) {
  const msg = { type: 'diagram-edit', id: fig.svg.id, source };
  // When the peer ships no compiler (editor: speaker), the edit travels as
  // compiled markup too – dgSwapFigure on the other side applies it.
  if (window.PSI_DG_EDIT_HTML) {
    const res = dgeCompile(fig, source);
    if (res.ok) msg.html = res.html;
  }
  return msg;
}

function dgeBroadcastEdit() {
  if (dgeApplyingRemote || !DGE.fig) return;
  if (typeof sendToPeer !== 'function' || typeof shouldBroadcast !== 'function') return;
  if (!shouldBroadcast()) {
    dgePendingEdits.set(DGE.fig.svg.id, { fig: DGE.fig, source: DGE.source });
    return;
  }
  dgePendingEdits.delete(DGE.fig.svg.id);
  sendToPeer(dgeEditMessage(DGE.fig, DGE.source));
}

// Called by toggleFreeze on the way back to live – the moment the held-back
// edits are owed to the room.
window.psiEditorThaw = () => {
  if (typeof sendToPeer !== 'function') return;
  for (const { fig, source } of dgePendingEdits.values()) {
    sendToPeer(dgeEditMessage(fig, source));
  }
  dgePendingEdits.clear();
};

// The watch server says so when a rebuild fails – a deleted asset, a syntax
// error made in a text editor beside this one. The status line is the one
// place an author working in here actually looks.
window.psiWatchBuildFailed = (why) => {
  if (DGE.open) dgeStatus('', 'the rebuild failed: ' + why, true);
};

function dgeApplyRemoteEdit(m) {
  const figs = DGE_FIGURES.length ? DGE_FIGURES : dgeCollectFigures();
  const fig = figs.find((f) => f.svg.id === m.id);
  if (!fig) return;
  dgeApplyingRemote = true;
  try {
    dgeApplyToPage(fig, m.source);
    // Persist the way a local edit persists (dgeSaveLocal's rule), or the
    // edit lives only in the DOM: reopening the editor on this figure loaded
    // the pre-edit source, and the next committed gesture broadcast
    // original-plus-delta – silently reverting the peer's edit everywhere.
    try {
      if (m.source === fig.body) localStorage.removeItem(dgeStoreKey(fig));
      else localStorage.setItem(dgeStoreKey(fig), m.source);
    } catch (e) { /* private mode, or a storage policy – same tolerance as dgeSaveLocal */ }
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
