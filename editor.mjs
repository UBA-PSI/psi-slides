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
      const markup = node.alt ? hit.markup : (hit.bare || hit.markup);
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
      width: data.width || 'standard',
      alt: data.alt || '',
      images: data.images || {},
      compiler: dgeCompilerFor(data.images),
    });
  });
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
    const res = fig.compiler.parseDiagramSource(src, fig.attrs);
    out.model = res.model;
    if (res.errors.length) {
      out.errors = dgeDedupe(res.errors);
      return out;
    }
    out.html = fig.compiler.renderDiagram(src, fig.attrs, { prefix: fig.prefix, alt: fig.alt });
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

// ── boot ────────────────────────────────────────────────────────────

window.psiEditor = {
  figures: () => (DGE_FIGURES.length ? DGE_FIGURES : dgeCollectFigures()),
  compile: dgeCompile,
  selfTest: dgeSelfTest,
  spanTable: (fig, body) => window.PSI_DG.createSpanTable(
    fig.compiler.parseDiagramSource(body === undefined ? fig.body : body, fig.attrs).model,
    body === undefined ? fig.body : body),
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', dgeCollectFigures, { once: true });
} else {
  dgeCollectFigures();
}
