
(() => {
  const body = document.body;
  const main = document.querySelector('main');
  const dataEl = document.getElementById('psiINT-reader-data');
  if (!main || !dataEl) return;
  let data = {};
  try { data = JSON.parse(dataEl.textContent) || {}; } catch (e) { return; }
  const S = data.s || {};
  const KEY = 'psi-reader:v1:' + (data.key || 'lecture');
  // The key up to this version: the source folder's name alone, which two
  // lectures in two week1 folders shared - one store, each lecture's
  // highlights listed as not found in the other. While the new key is empty,
  // the entries of the old store whose slide is in this document are copied
  // to it, and only those: copying the whole store gave each of the two
  // lectures the other's highlights, listed at the foot as not found. The
  // old store is left as it is, so the other lecture finds its own there and
  // a document built before still finds everything.
  const LEGACY = 'psi-reader:v1:' + (data.name || 'lecture');
  const foot = document.querySelector('[data-reader-slot=tools]');
  const narrowMq = window.matchMedia('(max-width: __PSI_READER_NOTES_BELOW__px)');
  const WS = /\s/;
  const SHY = '\u00ad';
  const UI = '[data-rd-ui]';
  // Not the author's running text: the build's own marks, the notes, and
  // the things a click opens in the lightbox. A figure goes whole - its
  // caption with it - and has highlights of its own; so does a code block,
  // whose words are anchored in the block's own text, so that marking code
  // moves no offset of a slide's prose.
  const SKIP = UI + ', .speaker-note, pulse-question, pulse-deck, pulse-summary, .chunk-num, .chunk-label, .sec-num, .psi-diagram, figure, '
    + '.katex, .math-display, pre, button, script, style, svg, video, iframe, textarea';
  // A whitespace node that is a child of one of these sits between two
  // blocks, and a mark round it would be an inline box in a block's place.
  const BLOCKISH = /^(UL|OL|DL|TABLE|THEAD|TBODY|TFOOT|TR|SECTION|ARTICLE|DIV|BLOCKQUOTE|MAIN|ASIDE|NAV|HEADER|FOOTER)$/;

  // ── storage ──
  let persistent = true;
  // An entry's type and a block's kind are looked up in tables, and a name
  // every object inherits - constructor, __proto__, toString - found
  // Object's own members there: a painter that was a function, a selector
  // that was an object. The entry threw in place() after it was stored, and
  // placeAll() threw on every load after it. Such a name is refused here,
  // so it is never stored; a type this build does not know is still kept,
  // because a later version may paint it. So is any field read as text that
  // is not text: an object with no usable toString throws wherever it is
  // turned into a string - a quote, a note, a figure's key, a part's name.
  const inherited = (v) => v != null && (typeof v !== 'string' || v in Object.prototype || v === '__proto__');
  const isText = (v) => v == null || typeof v === 'string';
  const rec = (v, keys) => v == null || (typeof v === 'object' && !Array.isArray(v) && keys.every(k => isText(v[k])));
  const valid = (h) => !!h && typeof h === 'object' && !Array.isArray(h)
    && typeof h.id === 'string' && typeof h.chunk === 'string' && !inherited(h.type)
    && ['note', 'quote', 'prefix', 'suffix'].every(k => isText(h[k]))
    && rec(h.block, ['kind', 'key']) && !(h.block && inherited(h.block.kind))
    && rec(h.fig, ['kind', 'key']) && rec(h.at, ['el']);
  const parse = (raw) => {
    if (!raw) return [];
    try { const a = JSON.parse(raw); return Array.isArray(a) ? a.filter(valid) : []; } catch (e) { return []; }
  };
  const load = () => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw == null && LEGACY !== KEY) {
        const ours = parse(window.localStorage.getItem(LEGACY)).filter((h) => {
          const el = document.getElementById(h.chunk);
          return !!el && main.contains(el);
        });
        if (ours.length) window.localStorage.setItem(KEY, JSON.stringify(ours));
        return ours;
      }
      return parse(raw);
    } catch (e) { persistent = false; return []; }
  };
  const save = () => {
    if (!persistent) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (e) { persistent = false; renderFoot(); }
  };
  let store = load();
  const byId = (id) => store.find(h => h.id === id) || null;

  // ── reader text ──
  const rootOf = (node) => {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !main.contains(el) || el.closest(UI)) return null;
    return el.closest('article.chunk[id]') || el.closest('section.column[id]');
  };
  const texts = (root) => {
    const out = [];
    const column = root.tagName === 'SECTION';
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
        if (n.matches(SKIP) || (column && n.matches('article.chunk'))) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      },
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  };
  const joined = (nodes) => nodes.map(t => t.data).join('');
  // The reader-text offset of a DOM boundary point. A point inside a skipped
  // element counts the text before it, so a selection that starts in a code
  // block starts after it and one that ends in a figure ends before it.
  const offsetOf = (nodes, node, off) => {
    const r = document.createRange();
    r.setStart(node, off);
    let acc = 0;
    for (const t of nodes) {
      const len = t.data.length;
      if (r.comparePoint(t, len) <= 0) { acc += len; continue; }
      if (r.comparePoint(t, 0) >= 0) break;
      acc += off;
      break;
    }
    return acc;
  };
  const quoteParts = (text, s, e) => ({
    quote: text.slice(s, e),
    prefix: text.slice(Math.max(0, s - 32), s),
    suffix: text.slice(e, e + 32),
  });

  // ── anchoring (plan §4) ──
  const norm = (str) => {
    let out = '', sp = true;
    const map = [];
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === SHY) continue;
      if (WS.test(c)) {
        if (!sp) { out += ' '; map.push(i); sp = true; }
        continue;
      }
      out += c; map.push(i); sp = false;
    }
    return { out, map };
  };
  const tailMatch = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++; return n; };
  const headMatch = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };
  const locateText = (h) => {
    const root = document.getElementById(h.chunk);
    if (!root || !main.contains(root) || !root.matches('article.chunk, section.column')) return null;
    const nodes = texts(root);
    return anchorIn(h, joined(nodes), { root, nodes });
  };
  // Where a quote stands in a text: at its offsets, else anywhere (the
  // surrounding words decide between several), else with whitespace and
  // soft hyphens folded. Adds s, e and text to what it is given.
  const anchorIn = (h, text, base) => {
    const quote = String(h.quote || '');
    if (!quote.trim()) return null;
    if (text.slice(h.start, h.end) === quote) return Object.assign(base, { s: h.start, e: h.end, text });
    let hits = [];
    for (let i = text.indexOf(quote); i >= 0; i = text.indexOf(quote, i + 1)) hits.push([i, i + quote.length]);
    if (!hits.length) {
      const T = norm(text), q = norm(quote).out.trim();
      if (q) for (let i = T.out.indexOf(q); i >= 0; i = T.out.indexOf(q, i + 1)) {
        hits.push([T.map[i], T.map[i + q.length - 1] + 1]);
      }
    }
    if (!hits.length) return null;
    const pre = String(h.prefix || ''), suf = String(h.suffix || '');
    const score = ([s, e]) => tailMatch(text.slice(Math.max(0, s - pre.length), s), pre)
      + headMatch(text.slice(e, e + suf.length), suf);
    let best = hits[0], bestScore = -1;
    for (const hit of hits) {
      const sc = score(hit);
      if (sc > bestScore || (sc === bestScore && Math.abs(hit[0] - h.start) < Math.abs(best[0] - h.start))) {
        best = hit; bestScore = sc;
      }
    }
    return Object.assign(base, { s: best[0], e: best[1], text });
  };
  const paintText = (h, at) => {
    const marks = [];
    let acc = 0;
    for (const t of at.nodes || texts(at.root)) {
      const len = t.data.length, a = acc, b = acc + len;
      acc = b;
      if (b <= at.s || a >= at.e) continue;
      const from = Math.max(at.s, a) - a, to = Math.min(at.e, b) - a;
      let node = t;
      if (to < len) node.splitText(to);
      if (from > 0) node = node.splitText(from);
      if (!node.data.trim() && BLOCKISH.test(node.parentNode.nodeName)) continue;
      const m = document.createElement('mark');
      m.className = 'rd-hl';
      m.dataset.hl = h.id;
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
      marks.push(m);
    }
    return marks;
  };
  // ── figures (plan §11) ──
  // A figure is a raster or an inlined vector in figure.figure-img, or a
  // ::: draw in figure.figure-diagram; a clip, an embed, code and formulas are
  // not. It is found again by its key - a diagram's label, an image's alt
  // text, else its file name - within its slide, and by its place among the
  // slide's figures when the key has changed; several with one key (two
  // diagrams under one heading) are told apart by that place.
  //
  // An entry marks the whole figure (at is null) or a spot in it: fractions
  // of the drawing's box - the viewBox of a vector, the picture of a raster -
  // and on a diagram the author's name for the part under the pointer as
  // well, since that survives a rebuild that moves the part and the fractions
  // do not. The name is kept without the dg<N>- the build prefixes it with,
  // which counts figures from the top of the document and moves when one is
  // added above. A part that is gone leaves the pin at the fractions, and
  // the card says it is approximate.
  //
  // What is drawn is drawn in the figure's own coordinates - a group in the
  // SVG, or a layer over the picture positioned in per cent - so the same
  // pin stands in the right place in the document, in the lightbox's copy
  // and on paper, with no layout of its own to keep up. A whole figure is a
  // thin yellow frame; a spot is a small yellow dot, and the part a diagram
  // pin is on is tinted with a class on its group. As with words, nothing is
  // numbered on screen; on paper a figure with a note carries its number.
  const FIG = 'figure.figure-img:not(.figure-missing), figure.figure-diagram';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const figsIn = (root) => [...root.querySelectorAll(FIG)].filter(f => !f.closest('#psiINT-lightbox, .speaker-note, ' + UI)
    && (root.tagName !== 'SECTION' || !f.closest('article.chunk')));
  const figRoot = (fig) => fig.closest('article.chunk[id]') || fig.closest('section.column[id]');
  const drawingOf = (fig) => fig.querySelector(':scope > svg, :scope > img, :scope > .rd-fig-box > img');
  const figKind = (fig) => fig.classList.contains('figure-diagram') ? 'diagram'
    : ((drawingOf(fig) || {}).tagName === 'IMG' ? 'image' : 'svg');
  const figKey = (fig) => {
    const d = drawingOf(fig);
    return (d && (d.getAttribute('aria-label') || d.getAttribute('alt'))) || fig.dataset.figId || '';
  };
  const vbOf = (svg) => {
    const v = svg.viewBox && svg.viewBox.baseVal;
    if (v && v.width > 0 && v.height > 0) return { x: v.x, y: v.y, w: v.width, h: v.height };
    const r = svg.getBoundingClientRect();
    return { x: 0, y: 0, w: svg.width.baseVal.value || r.width || 1, h: svg.height.baseVal.value || r.height || 1 };
  };
  // A point on screen in the SVG's own units, through whatever the lightbox
  // has scaled and moved it by.
  const toUser = (svg, x, y) => {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const prefixOf = (svg) => (svg.id && svg.id.endsWith('root')) ? svg.id.slice(0, -4) : '';
  const partNamed = (svg, name) => {
    const id = prefixOf(svg) + name;
    for (const g of svg.querySelectorAll('.dg-el')) if (g.id === id) return g;
    return null;
  };
  const nameOfPart = (svg, g) => {
    const pre = prefixOf(svg);
    return g.id && g.id.startsWith(pre) ? g.id.slice(pre.length) : g.id || '';
  };
  const partLabel = (g) => oneLine([...g.querySelectorAll('.dg-lbl')].map(t => t.textContent).join(' '));
  const figs = new Map();     // id -> { fig, part, whole }: what a painted figure entry is on
  const approx = new Set();   // ids whose part is gone
  const locateFig = (h) => {
    const root = document.getElementById(h.chunk);
    if (!root || !main.contains(root) || !root.matches('article.chunk, section.column')) return null;
    const f = h.fig || {};
    const all = figsIn(root);
    const keyed = f.key ? all.filter(x => figKey(x) === f.key) : [];
    // An index that is not a number is no figure: all['length'] is a number.
    const at = Number.isInteger(f.index) ? all[f.index] : undefined;
    let fig = keyed.includes(at) ? at : keyed[0];
    if (!fig && at && figKind(at) === f.kind) fig = at;
    if (!fig) return null;
    const now = { index: all.indexOf(fig), kind: figKind(fig), key: figKey(fig) };
    const same = now.index === f.index && now.kind === f.kind && now.key === f.key;
    return { fig, update: same ? null : { fig: now } };
  };
  const svgEl = (tag, attrs) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  // Draws one entry on a figure - the document's, or the lightbox's copy of
  // it - with a dot the same few pixels wide in either, at the size the
  // figure is drawn. Returns what stands for the entry
  // in the page (the drawing for a whole figure, else its dot), the part a
  // pin is on, and the number paper shows beside a whole figure.
  //
  // On screen, as with a text highlight, nothing is numbered: a whole figure
  // is its frame, a spot an unnumbered yellow dot with a thin dark edge that
  // reads on any drawing. On paper a figure with a note carries the note's
  // number - a spot in its dot, which grows to hold it, a whole figure beside
  // the frame's top right corner, towards the margin the note stands in.
  const drawFig = (h, fig) => {
    const d = drawingOf(fig);
    if (!d) return null;
    const a = h.at || null;
    const isSvg = d.tagName.toLowerCase() === 'svg';
    let box = null;
    const boxed = () => {
      if (box) return box;
      box = d.parentElement;
      if (!box.classList.contains('rd-fig-box')) {
        box = document.createElement('span');
        box.className = 'rd-fig-box';
        d.before(box);
        box.appendChild(d);
      }
      return box;
    };
    let vb = null, u = 1, layer = null;
    if (isSvg) {
      vb = vbOf(d);
      // One CSS pixel of the figure as it is drawn, in the drawing's units.
      const w = d.getBoundingClientRect().width;
      u = w > 0 ? vb.w / w : Math.max(vb.w, vb.h) / 600;
      layer = d.querySelector(':scope > g.rd-pins');
      if (!layer) { layer = svgEl('g', { class: 'rd-pins', 'data-rd-ui': '' }); d.appendChild(layer); }
    }
    if (!a) {
      // The frame is an element of its own, drawn where the pins are, and
      // not an outline on the svg or the picture. WebKit drew an outline on
      // an inline svg only where something else happened to repaint - the
      // corner under the button - and left it standing there once removed;
      // an element that is put in and taken out is repainted by every
      // engine. On a vector it lies just inside the viewBox, whose margin
      // keeps it clear of the ink, so nothing depends on how an engine
      // paints past an svg's own box; round a picture it stands 3 px clear.
      fig.classList.add('rd-fig-whole');
      let badge, frame;
      if (isSvg) {
        frame = svgEl('rect', { class: 'rd-frame', 'vector-effect': 'non-scaling-stroke',
          x: (vb.x + u).toFixed(2), y: (vb.y + u).toFixed(2),
          width: Math.max(0, vb.w - 2 * u).toFixed(2), height: Math.max(0, vb.h - 2 * u).toFixed(2) });
        layer.prepend(frame);
        badge = svgEl('text', { class: 'rd-pin-p rd-fig-no', 'dominant-baseline': 'hanging',
          x: (vb.x + vb.w + 6 * u).toFixed(2), y: (vb.y - 3 * u).toFixed(2), 'font-size': (9 * u).toFixed(2) });
        layer.appendChild(badge);
      } else {
        frame = document.createElement('span');
        frame.className = 'rd-frame';
        frame.setAttribute('data-rd-ui', '');
        boxed().insertBefore(frame, d.nextSibling);
        badge = document.createElement('span');
        badge.className = 'rd-pin-p rd-fig-no';
        badge.setAttribute('data-rd-ui', '');
        boxed().appendChild(badge);
      }
      frame.dataset.hl = badge.dataset.hl = h.id;
      return { disc: frame, part: null, badge };
    }
    let part = null, disc;
    if (isSvg) {
      part = a.el && fig.classList.contains('figure-diagram') ? partNamed(d, a.el) : null;
      const pr = part && part.getBoundingClientRect();
      let x, y;
      if (pr && (pr.width || pr.height)) {
        const edge = part.classList.contains('dg-edge');
        const p = toUser(d, edge ? (pr.left + pr.right) / 2 : pr.right, edge ? (pr.top + pr.bottom) / 2 : pr.top);
        x = p.x; y = p.y;
      } else {
        x = vb.x + (+a.x || 0) * vb.w; y = vb.y + (+a.y || 0) * vb.h;
      }
      if (part) part.classList.add('rd-el');
      disc = svgEl('g', { class: 'rd-pin', 'data-rd-ui': '', transform: 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')',
        style: '--rd-r: ' + (4.5 * u).toFixed(2) + 'px; --rd-rp: ' + (7.5 * u).toFixed(2) + 'px' });
      // A ring three times the dot's size takes the click, which a dot of
      // nine pixels would make a game of aim.
      disc.appendChild(svgEl('circle', { class: 'rd-hit', r: (13 * u).toFixed(2) }));
      disc.appendChild(svgEl('circle', { class: 'rd-dot', r: (4.5 * u).toFixed(2), 'stroke-width': (1.2 * u).toFixed(2) }));
      disc.appendChild(svgEl('text', { class: 'rd-pin-p', 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': (8 * u).toFixed(2) }));
      layer.appendChild(disc);
    } else {
      disc = document.createElement('span');
      disc.className = 'rd-pin';
      disc.setAttribute('data-rd-ui', '');
      disc.style.left = (+a.x || 0) * 100 + '%';
      disc.style.top = (+a.y || 0) * 100 + '%';
      const dot = document.createElement('span');
      dot.className = 'rd-pin-dot';
      const t = document.createElement('span');
      t.className = 'rd-pin-p';
      dot.appendChild(t);
      disc.appendChild(dot);
      boxed().appendChild(disc);
    }
    disc.dataset.hl = h.id;
    return { disc, part, badge: null };
  };
  // Takes everything the reader drew off a figure: the lightbox's copy before
  // it is drawn again, and a document figure whose last entry has gone.
  const stripFig = (fig) => {
    for (const n of fig.querySelectorAll(UI)) n.remove();
    for (const b of fig.querySelectorAll('.rd-fig-box')) { while (b.firstChild) b.before(b.firstChild); b.remove(); }
    for (const g of fig.querySelectorAll('.rd-el, .rd-hover')) g.classList.remove('rd-el', 'rd-hover');
    const d = drawingOf(fig);
    if (d) d.classList.remove('is-focus', 'rd-has-note');
    fig.classList.remove('rd-fig-whole');
  };
  const paintFig = (h, at) => {
    const got = drawFig(h, at.fig);
    if (!got) return [];
    figs.set(h.id, { fig: at.fig, part: got.part, whole: !h.at, badge: got.badge });
    approx.delete(h.id);
    if (h.at && h.at.el && !got.part) approx.add(h.id);
    return [got.disc];
  };
  // What is left on a figure once one of its entries has gone - with none
  // left, nothing: no frame, tint, layer, wrapper or class.
  const refreshFig = (fig) => {
    const on = [...figs.values()].filter(v => v.fig === fig);
    fig.classList.toggle('rd-fig-whole', on.some(v => v.whole));
    for (const g of fig.querySelectorAll('.rd-el')) if (!on.some(v => v.part === g)) g.classList.remove('rd-el');
    for (const l of fig.querySelectorAll('g.rd-pins')) if (!l.firstChild) l.remove();
    for (const b of fig.querySelectorAll('.rd-fig-box')) {
      if (b.querySelector(UI)) continue;
      while (b.firstChild) b.before(b.firstChild);
      b.remove();
    }
  };
  // A whole figure's frame is one of its marks, as a spot's dot is, so the
  // two go the same way.
  const unpaintFig = (id) => {
    const v = figs.get(id);
    if (v && v.badge) v.badge.remove();
    for (const m of marksOf.get(id) || []) m.remove();
    figs.delete(id);
    approx.delete(id);
    if (v) refreshFig(v.fig);
  };
  // The words a card and the export name a figure entry by.
  const figPhrase = (h) => {
    const f = h.fig || {};
    const key = oneLine(f.key) || String((+f.index || 0) + 1);
    if (!h.at) return fill(S['reader-fig'], { key });
    if (h.at.el) {
      const v = figs.get(h.id);
      return fill(S['reader-fig-at'], { key, label: (v && v.part && partLabel(v.part)) || h.at.el });
    }
    return fill(S['reader-fig-spot'], { key });
  };
  // ── code blocks and display formulas ──
  // Both open in the lightbox like a figure, and both can be marked whole
  // from a button in their corner: a yellow frame, a card, and on paper the
  // note's number on the frame. A code block also takes a text highlight,
  // anchored like prose but in the block's own text - chunk, the block's
  // place among the slide's code blocks and its first line as a key, then
  // offsets, quote and context within that block - so that the offsets of a
  // slide's prose, which leave code out, stay what they were. A formula takes
  // no selection: KaTeX sets one glyph per box.
  const BLOCKS = Object.assign(Object.create(null), { code: 'pre', formula: '.math-display' });
  const blocksIn = (root, kind) => [...root.querySelectorAll(BLOCKS[kind] || 'x-none')]
    .filter(b => !b.closest('#psiINT-lightbox, .speaker-note, pulse-question, pulse-deck, ' + UI) && (root.tagName !== 'SECTION' || !b.closest('article.chunk')));
  const blockKind = (el) => el.matches('pre') ? 'code' : 'formula';
  const codeTexts = (pre) => {
    const out = [];
    const w = document.createTreeWalker(pre, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.nodeType === 3 ? NodeFilter.FILTER_ACCEPT
        : (n.matches(UI + ', button, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  };
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const blockKey = (el) => {
    if (blockKind(el) === 'code') {
      const line = joined(codeTexts(el)).split('\n').find(l => l.trim());
      return cut((line || '').trim(), 80);
    }
    const tex = el.querySelector('annotation[encoding="application/x-tex"]');
    return cut(oneLine(tex ? tex.textContent : ''), 120);
  };
  const findBlock = (h) => {
    const root = document.getElementById(h.chunk);
    if (!root || !main.contains(root) || !root.matches('article.chunk, section.column')) return null;
    const b = h.block || {};
    const all = blocksIn(root, b.kind);
    const keyed = b.key ? all.filter(x => blockKey(x) === b.key) : [];
    const at = Number.isInteger(b.index) ? all[b.index] : undefined;
    const el = keyed.includes(at) ? at : (keyed[0] || at);
    if (!el) return null;
    const now = { kind: b.kind, index: all.indexOf(el), key: blockKey(el) };
    return { root, el, update: now.index === b.index && now.key === b.key ? null : { block: now } };
  };
  const blocks = new Map();   // id -> { el, badge }: a block marked whole
  const locateBlock = (h) => findBlock(h);
  const paintBlock = (h, at) => {
    at.el.classList.add('rd-block-whole');
    const badge = document.createElement('span');
    badge.className = 'rd-pin-p rd-fig-no';
    badge.setAttribute('data-rd-ui', '');
    at.el.appendChild(badge);
    blocks.set(h.id, { el: at.el, badge });
    return [at.el];
  };
  const unpaintBlock = (id) => {
    const v = blocks.get(id);
    blocks.delete(id);
    if (!v) return;
    v.badge.remove();
    if (![...blocks.values()].some(x => x.el === v.el)) v.el.classList.remove('rd-block-whole', 'is-focus', 'rd-has-note');
  };
  // Code text: the block is found as above and the quote in its text; the
  // marks are laid round each text node a Shiki token holds, as in prose.
  const locateCode = (h) => {
    const f = findBlock(h);
    if (!f) return null;
    const nodes = codeTexts(f.el);
    const at = anchorIn(h, joined(nodes), { root: f.root, nodes, pre: f.el });
    if (at && f.update) at.update = f.update;
    return at;
  };
  // The words a card and the export name such an entry by.
  const whatOf = (h) => {
    if (h.type === 'figure') return figPhrase(h);
    const b = h.block || {};
    const key = oneLine(b.key) || String((+b.index || 0) + 1);
    if (h.type === 'code') {
      const at = marksOf.has(h.id) && locateCode(h);
      const text = at ? at.text : '';
      const line = at ? text.slice(0, at.s).split('\n').length : '?';
      return fill(S['reader-code'], { line, key });
    }
    if (h.type === 'block') return fill(S[b.kind === 'formula' ? 'reader-formula' : 'reader-code-block'], { key });
    return '';
  };
  const KINDS = Object.assign(Object.create(null), {
    text: { locate: locateText, paint: paintText },
    figure: { locate: locateFig, paint: paintFig },
    block: { locate: locateBlock, paint: paintBlock },
    code: { locate: locateCode, paint: paintText },
  });

  // ── painting ──
  const marksOf = new Map();   // id -> the elements its painter drew
  const orphans = new Set();
  // A figure's drawing is taken off by its own painter; a text highlight is
  // unwrapped. Asked by id, because a removed entry has left the store.
  const unpaint = (id) => {
    if (figs.has(id)) { unpaintFig(id); marksOf.delete(id); return; }
    if (blocks.has(id)) { unpaintBlock(id); marksOf.delete(id); return; }
    for (const m of marksOf.get(id) || []) {
      const p = m.parentNode;
      if (!p) continue;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    }
    marksOf.delete(id);
  };
  const noteMarks = (h) => {
    const has = !!(h.note && h.note.trim());
    for (const m of marksOf.get(h.id) || []) m.classList.toggle('rd-has-note', has);
  };
  // Places one entry; true when its anchor moved and the store should be
  // written back. An entry a painter throws on is listed as not found rather
  // than thrown: placeAll() runs on every load, and one entry that throws
  // there used to leave every entry after it unpainted for good.
  const place = (h) => {
    try { return placeOne(h); } catch (e) {
      try { unpaint(h.id); } catch (e2) { /* nothing was drawn */ }
      orphans.add(h.id);
      return false;
    }
  };
  const placeOne = (h) => {
    // Placed twice, an entry would be drawn twice and taken off once.
    if (marksOf.has(h.id)) unpaint(h.id);
    orphans.delete(h.id);
    const kind = KINDS[h.type || 'text'];
    const at = kind && kind.locate(h);
    if (!at) { orphans.add(h.id); return false; }
    let moved = false;
    if (at.text !== undefined && (at.s !== h.start || at.e !== h.end)) {
      Object.assign(h, { start: at.s, end: at.e }, quoteParts(at.text, at.s, at.e));
      moved = true;
    }
    if (at.update) { Object.assign(h, at.update); moved = true; }
    const marks = kind.paint(h, at);
    if (!marks.length) { orphans.add(h.id); return moved; }
    marksOf.set(h.id, marks);
    noteMarks(h);
    if (h.id === focused) for (const m of marks) m.classList.add('is-focus');
    return moved;
  };
  const placeAll = () => {
    let moved = false;
    for (const h of store) if (place(h)) moved = true;
    if (moved) save();
  };

  // ── the cards ──
  const layer = document.createElement('div');
  layer.className = 'rd-notes';
  layer.setAttribute('data-rd-ui', '');
  body.appendChild(layer);
  const cards = new Map();
  let focused = null;
  const button = (cls, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    return b;
  };
  const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  const cardFor = (h) => {
    let card = cards.get(h.id);
    if (card) return card;
    card = document.createElement('div');
    card.className = 'rd-card';
    card.setAttribute('data-rd-ui', '');
    card.dataset.hl = h.id;
    card.tabIndex = -1;
    const ta = document.createElement('textarea');
    ta.className = 'rd-note';
    ta.rows = 1;
    ta.placeholder = S['reader-note'] || '';
    ta.setAttribute('aria-label', S['reader-note'] || '');
    ta.value = h.note || '';
    const acts = document.createElement('div');
    acts.className = 'rd-actions';
    // One action: remove takes the note with it, and emptying the field is
    // how a note alone goes.
    acts.append(button('rd-remove', S['reader-remove'] || ''));
    // A figure's card says which figure, and where in it: the page beside
    // it has no yellow words to say so.
    if (h.type === 'figure' || h.type === 'block' || h.type === 'code') {
      const what = document.createElement('p');
      what.className = 'rd-card-what';
      card.appendChild(what);
    }
    card.append(ta, acts);
    // Over the lightbox, a press on the card is the card's and not the start
    // of a drag, nor a click that closes the overlay.
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    cards.set(h.id, card);
    return card;
  };
  const describe = (card, h) => {
    const w = card.querySelector('.rd-card-what');
    if (!w) return;
    w.textContent = whatOf(h);
    if (approx.has(h.id)) {
      const a = document.createElement('span');
      a.className = 'rd-approx';
      a.textContent = S['reader-fig-approx'] || '';
      w.append(' ', a);
    }
  };
  const dropCard = (id) => {
    if (lbCard === id) lbCard = null;
    const c = cards.get(id);
    if (c) c.remove();
    cards.delete(id);
  };
  const shown = (h) => marksOf.has(h.id) && (h.id === focused || !!(h.note && h.note.trim()));
  // Narrow, the card stands under the block that holds the highlight - in a
  // list item, inside it; in a table, after the table - and only while the
  // highlight is the one being read.
  const placeInline = (card, h) => {
    const m = (marksOf.get(h.id) || [])[0];
    if (!m) return;
    let block = m.closest('pre, .math-display, figure')
      || m.closest('li, p, h1, h2, h3, h4, h5, h6, dd, dt, td, th, blockquote') || m.parentElement;
    if (block.matches('td, th')) block = block.closest('table') || block;
    if (block.matches('li')) {
      if (block.lastElementChild !== card) block.appendChild(card);
    } else if (block.nextElementSibling !== card) {
      block.after(card);
    }
  };
  const pack = () => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const mr = main.getBoundingClientRect();
    const left = mr.right + window.scrollX;
    const width = Math.max(8 * rem, Math.min(17 * rem, window.innerWidth - mr.right - 0.75 * rem));
    const items = [];
    for (const [id, card] of cards) {
      if (card.parentNode !== layer) continue;
      const m = (marksOf.get(id) || [])[0];
      if (!m) continue;
      card.style.left = left + 'px';
      card.style.width = width + 'px';
      grow(card.querySelector('.rd-note'));
      items.push({ id, card, want: m.getBoundingClientRect().top + window.scrollY - 0.4 * rem });
    }
    for (const it of items) it.h = it.card.offsetHeight;
    items.sort((a, b) => a.want - b.want);
    const gap = 0.5 * rem;
    const forward = () => {
      let floor = -Infinity;
      for (const it of items) { it.top = Math.max(it.want, floor); floor = it.top + it.h + gap; }
    };
    // The card being read stands level with its highlight; the others make
    // way for it, upwards and downwards, and only where there is no room
    // above does it give up its place.
    const fi = items.findIndex(it => it.id === focused);
    if (fi < 0) forward();
    else {
      items[fi].top = items[fi].want;
      for (let i = fi + 1; i < items.length; i++) {
        const p = items[i - 1];
        items[i].top = Math.max(items[i].want, p.top + p.h + gap);
      }
      for (let i = fi - 1; i >= 0; i--) {
        const n = items[i + 1];
        items[i].top = Math.min(items[i].want, n.top - items[i].h - gap);
      }
      if (items.length && items[0].top < 0) forward();
    }
    // A margin note (style: {print-marginalia: margin}) stands in this same
    // column, and a card laid over it would hide the author's words under
    // the reader's: a card that meets one moves below it, and the cards
    // after it make way in turn. Only a note the layout floated is in the
    // column - under the breakpoint it is an aside in the text.
    const inMargin = Array.from(main.querySelectorAll('.marginalia'))
      .filter(n => getComputedStyle(n).float === 'right')
      .map(n => { const r = n.getBoundingClientRect(); return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY }; })
      .sort((a, b) => a.top - b.top);
    if (inMargin.length) {
      let floor = -Infinity;
      for (const it of items) {
        let top = Math.max(it.top, floor);
        for (const n of inMargin) if (top < n.bottom + gap && top + it.h + gap > n.top) top = n.bottom + gap;
        it.top = top;
        floor = top + it.h + gap;
      }
    }
    for (const it of items) it.card.style.top = Math.round(it.top) + 'px';
  };
  // ── paper (plan §6) ──
  // What a printed page carries for a highlight with a note: a number after
  // its last word and the note in the outer margin, numbered in the page's
  // order. Both are written into the text and hidden on screen, rebuilt on
  // every layout, so a printout is always the page as it stands and no
  // print event has to be caught. Where the note goes is decided here, on
  // the screen's layout, which is the document's own: the column is one
  // measure in both media, and only its width differs.
  // A note is set at the line its highlight starts on when every block
  // between that line and the slide runs to the column's right edge in
  // plain block flow; otherwise before the outermost block that does not -
  // a table, a lede narrower than the column, a card in a grid - because a
  // float inside such a block would stand inside it.
  const paperNodes = [];
  const inFlow = (el) => {
    const cs = getComputedStyle(el);
    if (!/^(block|list-item)$/.test(cs.display) || cs.float !== 'none') return false;
    if (cs.position === 'absolute' || cs.position === 'fixed' || cs.overflowX !== 'visible') return false;
    if (cs.columnCount !== 'auto') return false;
    const pd = el.parentElement ? getComputedStyle(el.parentElement).display : '';
    return !/flex|grid|table/.test(pd);
  };
  const paperSpot = (m, root) => {
    if (!inFlow(root)) return { before: root };
    const right = root.getBoundingClientRect().right;
    const blocks = [];
    for (let el = m.parentElement; el && el !== root; el = el.parentElement) {
      if (!/^inline/.test(getComputedStyle(el).display)) blocks.push(el);
    }
    let i = blocks.length;
    while (i > 0 && inFlow(blocks[i - 1]) && Math.abs(blocks[i - 1].getBoundingClientRect().right - right) < 1.5) i--;
    return { before: i ? blocks[i - 1] : m };
  };
  // A figure's number is in its dot, or beside the frame of a figure or a
  // block marked whole, so it gets no superscript; its note stands level
  // with the top of the figure or the block.
  const paper = () => {
    for (const n of paperNodes) n.remove();
    paperNodes.length = 0;
    for (const t of main.querySelectorAll('.rd-pin-p')) t.textContent = '';
    let k = 0;
    for (const { h } of ordered()) {
      if (!hasNote(h)) continue;
      const ms = marksOf.get(h.id);
      const root = ms[0].closest('article.chunk[id], section.column[id]');
      if (!root) continue;
      k++;
      const fv = figs.get(h.id) || blocks.get(h.id);
      if (fv) {
        const t = fv.badge || (fv.fig && ms[0].querySelector('.rd-pin-p'));
        if (t) t.textContent = String(k);
        const note = document.createElement('span');
        note.className = 'rd-pnote';
        note.setAttribute('data-rd-ui', '');
        const num = document.createElement('b');
        num.textContent = String(k);
        note.append(num, h.note.trim());
        paperSpot(fv.fig || fv.el, root).before.before(note);
        paperNodes.push(note);
        continue;
      }
      const sup = document.createElement('sup');
      sup.className = 'rd-pn';
      sup.setAttribute('data-rd-ui', '');
      sup.textContent = String(k);
      ms[ms.length - 1].after(sup);
      const note = document.createElement('span');
      note.className = 'rd-pnote';
      note.setAttribute('data-rd-ui', '');
      const num = document.createElement('b');
      num.textContent = String(k);
      note.append(num, h.note.trim());
      paperSpot(ms[0], root).before.before(note);
      paperNodes.push(sup, note);
    }
  };
  const layout = () => {
    const narrow = narrowMq.matches;
    for (const h of store) {
      if (h.id === lbCard) continue;
      if (!shown(h) || (narrow && h.id !== focused)) {
        const c = cards.get(h.id);
        if (c && c.parentNode) c.remove();
        continue;
      }
      const card = cardFor(h);
      describe(card, h);
      card.classList.toggle('is-focus', h.id === focused);
      if (narrow) {
        card.style.left = card.style.top = card.style.width = '';
        placeInline(card, h);
        grow(card.querySelector('.rd-note'));
      } else if (card.parentNode !== layer) {
        layer.appendChild(card);
      }
    }
    if (!narrow) pack();
    paper();
    updateNav();
    syncLb();
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; layout(); });
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  if (narrowMq.addEventListener) narrowMq.addEventListener('change', schedule);
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(main);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

  const setFocus = (id, opts = {}) => {
    if (focused !== id) {
      for (const m of marksOf.get(focused) || []) m.classList.remove('is-focus');
      focused = id;
      for (const m of marksOf.get(focused) || []) m.classList.add('is-focus');
    }
    layout();
    const card = id && cards.get(id);
    if (!card || !card.isConnected) return;
    if (opts.edit) card.querySelector('.rd-note').focus({ preventScroll: true });
    else if (opts.card) card.focus({ preventScroll: true });
    if (opts.reveal) card.scrollIntoView({ block: 'nearest' });
  };

  // ── the undo notice ──
  let toastEl = null, toastTimer = 0, undoFn = null;
  const hideToast = () => { if (toastEl) toastEl.hidden = true; undoFn = null; clearTimeout(toastTimer); };
  const toast = (msg, undo) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'rd-toast';
      toastEl.setAttribute('data-rd-ui', '');
      toastEl.setAttribute('role', 'status');
      const span = document.createElement('span');
      const b = button('rd-undo', S['reader-undo'] || '');
      b.addEventListener('click', () => { const f = undoFn; hideToast(); if (f) f(); });
      toastEl.append(span, b);
      body.appendChild(toastEl);
    }
    toastEl.firstChild.textContent = msg;
    toastEl.hidden = false;
    undoFn = undo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  };

  // ── the way through them: the pill, n and p, the counts in the contents ──
  // The route is every entry a painter placed, in the order its first painted
  // element stands in the page. Ordering by element rather than by chunk and
  // offset is what lets a figure's highlight (plan §11) join the same route
  // with nothing here changed: its painter hands back elements as well. An
  // entry that could not be placed is in the sidebar's foot, not on the route.
  const hasNote = (h) => !!(h.note && h.note.trim());
  const FOLLOWS = Node.DOCUMENT_POSITION_FOLLOWING;
  const ordered = () => store.filter(h => marksOf.has(h.id))
    .map(h => ({ h, el: marksOf.get(h.id)[0] }))
    .sort((a, b) => a.el === b.el ? 0 : (a.el.compareDocumentPosition(b.el) & FOLLOWS ? -1 : 1));
  let onlyNotes = false;
  const route = () => ordered().filter(x => !onlyNotes || hasNote(x.h));

  const pill = document.createElement('div');
  pill.className = 'rd-nav';
  pill.setAttribute('data-rd-ui', '');
  pill.setAttribute('role', 'group');
  pill.setAttribute('aria-label', S['reader-nav'] || '');
  pill.hidden = true;
  const arrow = (cls, glyph, label, key) => {
    const b = button(cls, glyph);
    b.setAttribute('aria-label', label || '');
    b.title = (label || '') + ' (' + key + ')';
    b.setAttribute('aria-keyshortcuts', key);
    return b;
  };
  const prevBtn = arrow('rd-prev', '‹', S['reader-prev'], 'p');
  const nextBtn = arrow('rd-next', '›', S['reader-next'], 'n');
  const posEl = document.createElement('span');
  posEl.className = 'rd-pos';
  const filter = document.createElement('span');
  filter.className = 'rd-filter';
  const allBtn = button('rd-f-all', S['reader-filter-all'] || '');
  const notesBtn = button('rd-f-notes', S['reader-filter-notes'] || '');
  filter.append(allBtn, notesBtn);
  pill.append(prevBtn, posEl, nextBtn, filter);
  body.appendChild(pill);

  // The menu in the sidebar's foot. Built once rather than with the list of
  // lost highlights under it, so a button keeps the focus through a redraw.
  // Export and delete all stand only while there is something to export or
  // delete; import and the ? beside it stand always, because a reader in a
  // new browser has nothing yet and every reason to import. The ? opens four
  // lines: what the tools are, where highlights are kept, why that storage
  // is fragile and why the export is the backup. They stood open under the
  // buttons at first and were in the way of a reader who had read them once.
  const menu = document.createElement('div');
  menu.className = 'rd-menu';
  menu.setAttribute('data-rd-ui', '');
  const menuActs = document.createElement('div');
  menuActs.className = 'rd-menu-acts';
  const exportBtn = button('rd-export', S['reader-export'] || '');
  const importBtn = button('rd-import', S['reader-import'] || '');
  const deleteAllBtn = button('rd-delete-all', S['reader-delete-all'] || '');
  const helpBtn = button('rd-help-btn', '');
  const ring = document.createElement('span');
  ring.className = 'rd-q';
  ring.textContent = '?';
  helpBtn.appendChild(ring);
  helpBtn.setAttribute('aria-label', S['reader-help'] || '');
  helpBtn.title = S['reader-help'] || '';
  helpBtn.setAttribute('aria-expanded', 'false');
  helpBtn.setAttribute('aria-controls', 'psiINT-rd-help');
  menuActs.append(exportBtn, importBtn, deleteAllBtn, helpBtn);
  const helpEl = document.createElement('div');
  helpEl.className = 'rd-help';
  helpEl.id = 'psiINT-rd-help';
  helpEl.hidden = true;
  helpEl.tabIndex = -1;
  helpEl.setAttribute('role', 'group');
  helpEl.setAttribute('aria-label', S['reader-help'] || '');
  for (const k of ['reader-help-what', 'reader-help-keys', 'reader-help-where', 'reader-help-risk', 'reader-help-backup']) {
    const para = document.createElement('p');
    para.textContent = S[k] || '';
    if (k === 'reader-help-keys') para.className = 'rd-keys-line';
    helpEl.appendChild(para);
  }
  const reportEl = document.createElement('p');
  reportEl.className = 'rd-report';
  reportEl.setAttribute('role', 'status');
  reportEl.hidden = true;
  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = '.md,.markdown,.txt,text/markdown,text/plain';
  fileIn.hidden = true;
  fileIn.className = 'rd-file';
  menu.append(menuActs, helpEl, reportEl, fileIn);
  if (foot) foot.appendChild(menu);
  const setReport = (msg) => { reportEl.textContent = msg || ''; reportEl.hidden = !msg; };
  // Opened by the ? and closed by it again, by Esc, or by a click anywhere
  // else. It opens with the focus on it, so a screen reader reads the four
  // lines, and Esc hands the focus back to the button; a click elsewhere
  // leaves the focus where that click put it.
  const setHelp = (on, refocus) => {
    helpEl.hidden = !on;
    helpBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      helpEl.focus({ preventScroll: true });
    } else if (refocus) helpBtn.focus({ preventScroll: true });
  };
  helpBtn.addEventListener('click', () => setHelp(helpEl.hidden, false));
  document.addEventListener('click', (e) => {
    if (helpEl.hidden || !e.target.closest || e.target.closest('.rd-help, .rd-help-btn')) return;
    setHelp(false, false);
  }, true);
  // Ahead of the sidebar's own Esc, which would close the overlay with it.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || helpEl.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    setHelp(false, true);
  }, true);

  // The count beside a contents entry: the slide's own highlights, and on a
  // part's heading those of its lede. Every highlight, whatever the filter
  // says - the filter is a way through the page, the count is what is in it.
  const countLinks = [...document.querySelectorAll('#psiINT-reader-contents a[data-rd], #psiINT-reader-contents a.rd-part')];
  const counts = () => {
    const n = new Map();
    for (const h of store) if (marksOf.has(h.id)) n.set(h.chunk, (n.get(h.chunk) || 0) + 1);
    for (const a of countLinks) {
      const id = a.dataset.rd || (a.getAttribute('href') || '').slice(1);
      const k = n.get(id) || 0;
      let c = a.querySelector('.rd-count');
      if (!k) { if (c) c.remove(); continue; }
      if (!c) { c = document.createElement('span'); c.className = 'rd-count'; a.appendChild(c); }
      c.textContent = String(k);
      c.setAttribute('aria-label', (S['reader-nav'] || '') + ': ' + k);
    }
    // A folded part says how many are in it, lede and slides together; the
    // stylesheet shows this sum while the part is closed and the slides'
    // own counts while it is open, so folding asks nothing of this script.
    for (const g of document.querySelectorAll('#psiINT-reader-contents .rd-group')) {
      const head = g.querySelector('.rd-part');
      if (!head) continue;
      let k = 0;
      for (const a of g.querySelectorAll('a.rd-part, a[data-rd]')) {
        k += n.get(a.dataset.rd || (a.getAttribute('href') || '').slice(1)) || 0;
      }
      let c = head.querySelector('.rd-sum');
      if (!k) { if (c) c.remove(); continue; }
      if (!c) { c = document.createElement('span'); c.className = 'rd-sum'; head.appendChild(c); }
      c.textContent = String(k);
      c.setAttribute('aria-label', (S['reader-nav'] || '') + ': ' + k);
    }
  };

  // Stops at both ends rather than wrapping: a reader who presses n on the
  // last highlight and lands on the first has lost their place in a document
  // of forty pages, and a greyed arrow says where the end is. With none of
  // them open, the way starts where the reader is - n takes the first below
  // the top of the window, p the last above it - and with one open that the
  // filter leaves out, from that one.
  const updateNav = () => {
    const all = ordered();
    pill.hidden = !all.length;
    counts();
    exportBtn.hidden = deleteAllBtn.hidden = !store.length;
    const list = onlyNotes ? all.filter(x => hasNote(x.h)) : all;
    const at = list.findIndex(x => x.h.id === focused);
    posEl.textContent = (at >= 0 ? at + 1 : '–') + ' / ' + list.length;
    prevBtn.disabled = !list.length || at === 0;
    nextBtn.disabled = !list.length || (at >= 0 && at === list.length - 1);
    allBtn.setAttribute('aria-pressed', onlyNotes ? 'false' : 'true');
    notesBtn.setAttribute('aria-pressed', onlyNotes ? 'true' : 'false');
  };
  const go = (id) => {
    const el = (marksOf.get(id) || [])[0];
    if (!el) return;
    setFocus(id, { card: true });
    el.scrollIntoView({ block: 'center' });
    const card = cards.get(id);
    if (card && card.isConnected) card.scrollIntoView({ block: 'nearest' });
  };
  const step = (dir) => {
    const list = route();
    if (!list.length) return;
    let i = list.findIndex(x => x.h.id === focused);
    if (i >= 0) i += dir;
    else {
      const from = focused && (marksOf.get(focused) || [])[0];
      const ahead = from
        ? list.map(x => !!(from.compareDocumentPosition(x.el) & FOLLOWS))
        : list.map(x => x.el.getBoundingClientRect().top >= 0);
      i = dir > 0 ? ahead.indexOf(true) : ahead.lastIndexOf(false);
    }
    if (i >= 0 && i < list.length) go(list[i].h.id);
  };
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  const setFilter = (on) => { onlyNotes = on; updateNav(); };
  allBtn.addEventListener('click', () => setFilter(false));
  notesBtn.addEventListener('click', () => setFilter(true));
  // n and p: never while typing, never with a modifier (the browser's own
  // shortcuts), and not while the lightbox or the contents lie over the page.
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'n' && e.key !== 'p') || e.defaultPrevented || e.isComposing) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || pill.hidden) return;
    if (body.classList.contains('lb-open') || body.classList.contains('rd-open')) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable=false])')) return;
    e.preventDefault();
    step(e.key === 'n' ? 1 : -1);
  });

  // ── the sidebar's foot: what could not be placed, and the session notice ──
  const renderFoot = () => {
    if (!foot) return;
    for (const n of foot.querySelectorAll('.rd-hl-foot')) n.remove();
    const box = document.createElement('div');
    box.className = 'rd-hl-foot';
    if (!persistent) {
      const p = document.createElement('p');
      p.className = 'rd-notice';
      p.textContent = S['reader-session'] || '';
      box.appendChild(p);
    }
    const lost = store.filter(h => orphans.has(h.id));
    if (lost.length) {
      const head = document.createElement('p');
      head.className = 'rd-foot-head';
      head.textContent = S['reader-orphans'] || '';
      const ul = document.createElement('ul');
      ul.className = 'rd-orphans';
      for (const h of lost) {
        const li = document.createElement('li');
        const q = document.createElement('q');
        const text = String(h.quote || whatOf(h) || h.id);
        q.textContent = text.length > 120 ? text.slice(0, 117) + '…' : text;
        li.appendChild(q);
        if (h.note && h.note.trim()) {
          const n = document.createElement('span');
          n.className = 'rd-orphan-note';
          n.textContent = h.note;
          li.appendChild(n);
        }
        const b = button('rd-orphan-remove', S['reader-orphan-remove'] || '');
        b.dataset.hl = h.id;
        li.appendChild(b);
        ul.appendChild(li);
      }
      box.append(head, ul);
    }
    if (box.firstChild) foot.appendChild(box);
  };

  // ── export, import, delete all (plan §5) ──
  const fill = (str, vals) => String(str || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? String(vals[k]) : m));
  const oneLine = (t) => String(t || '').split(SHY).join('').replace(/\s+/g, ' ').trim();
  // A heading's words without what the page adds to them: a formula's second,
  // MathML copy, and the count this script puts beside a contents entry.
  const plain = (el) => {
    if (!el) return '';
    const c = el.cloneNode(true);
    for (const x of c.querySelectorAll('.katex-mathml, .rd-count, .rd-sum, .chunk-num, .chunk-label, .sec-num, .rd-part-num, [data-rd-ui]')) x.remove();
    return oneLine(c.textContent);
  };
  // The heading a slide's highlights stand under: the number the page prints
  // (none under slide-numbers: off), the slide's name as the contents list
  // gives it, and the id - the one of the three a rebuild does not move.
  const slideLine = (chunk) => {
    const id = '{#' + chunk + '}';
    const root = document.getElementById(chunk);
    if (!root || !main.contains(root) || !root.matches('article.chunk, section.column')) return id;
    const esc = window.CSS && CSS.escape ? CSS.escape(chunk) : chunk;
    let name = plain(document.querySelector('#psiINT-reader-contents a[data-rd="' + esc + '"] .rd-text, #psiINT-reader-contents a.rd-part[href="#' + esc + '"]'));
    if (!name) name = plain(root.querySelector(root.tagName === 'SECTION' ? '.column-heading' : 'h1, h2, h3'));
    const num = body.dataset.slideNums !== 'off' && root.dataset.chunkNum ? root.dataset.chunkNum : '';
    return [num, name].filter(Boolean).join(' · ') + (num || name ? ' ' : '') + id;
  };
  // The entry, whole, in a comment a Markdown reader does not show. Two
  // hyphens in a row would end the comment early, and in this JSON they can
  // only stand inside a string, where an escape reads back the same.
  const dataLine = (h) => '<' + '!-- psi-reader ' + JSON.stringify(h).replace(/--/g, '-\\u002d') + ' --' + '>';
  // A figure entry is named rather than quoted - which figure, and the words
  // on the part a pin is on - so that a lecturer reading the file sees what
  // the reader pointed at and not a pair of fractions.
  const entryLines = (h) => {
    const out = [];
    const what = whatOf(h);
    if (what) out.push('*' + what + '*', '');
    const q = h.type === 'figure' || h.type === 'block' ? '' : oneLine(h.quote) || oneLine(h.fig && h.fig.key);
    if (q) out.push('> ' + q, '');
    if (hasNote(h)) out.push(h.note.trim(), '');
    out.push(dataLine(h), '');
    return out;
  };
  const toMarkdown = () => {
    const lang = document.documentElement.lang || undefined;
    let date;
    try { date = new Date().toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { date = new Date().toISOString().slice(0, 10); }
    const lines = [
      '# ' + (S['reader-nav'] || '') + ' – ' + oneLine(data.title), '',
      fill(S['reader-export-line'], { date, n: store.length, notes: store.filter(hasNote).length }), '',
    ];
    let last = null;
    for (const { h } of ordered()) {
      if (h.chunk !== last) { lines.push('## ' + slideLine(h.chunk), ''); last = h.chunk; }
      lines.push(...entryLines(h));
    }
    const lost = store.filter(h => !marksOf.has(h.id));
    if (lost.length) {
      lines.push('## ' + (S['reader-orphans'] || ''), '');
      for (const h of lost) lines.push('### ' + slideLine(h.chunk), '', ...entryLines(h));
    }
    return lines.join('\n');
  };
  const exportFile = () => {
    const name = (data.name || 'lecture') + '-' + (S['reader-export-file'] || 'highlights') + '.md';
    const url = URL.createObjectURL(new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    a.setAttribute('data-rd-ui', '');
    body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setReport('');
  };
  // Only the data comments are read. One that does not parse, or parses to
  // something that is not an entry, is counted and skipped, never thrown.
  const readEntries = (text) => {
    const found = [];
    let bad = 0;
    const re = /<[!]--\s*psi-reader\s*([\s\S]*?)--[>]/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      let h = null;
      try { h = JSON.parse(m[1]); } catch (e) { h = null; }
      if (valid(h) && !Array.isArray(h)) found.push(Object.assign({}, h, { note: typeof h.note === 'string' ? h.note : '' }));
      else bad++;
    }
    return { found, bad };
  };
  const stamp = (h) => Number(h.edited || h.created || 0) || 0;
  const importText = (text) => {
    const { found, bad } = readEntries(String(text || ''));
    const skipped = bad ? ' ' + fill(S['reader-import-skipped'], { n: bad }) : '';
    if (!found.length) { setReport((S['reader-import-none'] || '') + skipped); return; }
    const added = new Set(), updated = new Set();
    for (const h of found) {
      const i = store.findIndex(x => x.id === h.id);
      if (i < 0) { store.push(h); added.add(h.id); continue; }
      if (stamp(h) <= stamp(store[i])) continue;
      unpaint(h.id);
      dropCard(h.id);
      orphans.delete(h.id);
      store[i] = h;
      if (!added.has(h.id)) updated.add(h.id);
    }
    let orphaned = 0;
    for (const id of new Set([...added, ...updated])) {
      place(byId(id));
      if (orphans.has(id)) orphaned++;
    }
    save();
    renderFoot();
    layout();
    setReport(fill(S['reader-imported'], { added: added.size, updated: updated.size, orphaned }) + skipped);
  };
  const deleteAll = () => {
    if (!store.length) return;
    const before = store.slice();
    for (const h of before) { unpaint(h.id); dropCard(h.id); }
    store = [];
    orphans.clear();
    focused = null;
    save();
    setReport('');
    renderFoot();
    layout();
    toast(S['reader-deleted-all'] || '', () => {
      const now = new Set(store.map(h => h.id));
      const back = before.filter(h => !now.has(h.id));
      store = back.concat(store);
      for (const h of back) place(h);
      save();
      renderFoot();
      layout();
    });
  };
  exportBtn.addEventListener('click', exportFile);
  deleteAllBtn.addEventListener('click', deleteAll);
  importBtn.addEventListener('click', () => { fileIn.value = ''; fileIn.click(); });
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { importText(r.result); } catch (e) { setReport(S['reader-import-none'] || ''); } };
    r.onerror = () => setReport(S['reader-import-none'] || '');
    r.readAsText(f);
  });

  // ── making, removing ──
  const newId = () => 'h-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const fromSelection = () => {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    // A selection belongs to the chunk it starts in and is clipped to it;
    // one that starts in a code block, to that block.
    const root = rootOf(r.startContainer);
    if (!root) return null;
    const sn = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
    const pre = sn && sn.closest('pre');
    if (pre && root.contains(pre) && blocksIn(root, 'code').includes(pre)) {
      const nodes = codeTexts(pre), text = joined(nodes);
      let s = offsetOf(nodes, r.startContainer, r.startOffset);
      let e = offsetOf(nodes, r.endContainer, r.endOffset);
      while (s < e && WS.test(text[s])) s++;
      while (e > s && WS.test(text[e - 1])) e--;
      if (e <= s) return null;
      return { root, pre, s, e, text, range: r };
    }
    const nodes = texts(root), text = joined(nodes);
    let s = offsetOf(nodes, r.startContainer, r.startOffset);
    let e = offsetOf(nodes, r.endContainer, r.endOffset);
    while (s < e && WS.test(text[s])) s++;
    while (e > s && WS.test(text[e - 1])) e--;
    if (e <= s) return null;
    return { root, s, e, text, range: r };
  };
  const make = (p) => {
    const now = Date.now();
    const chunk = p.root.id;
    let s = p.s, e = p.e;
    // In a code block: the same, in the block's own text.
    const code = p.pre ? { kind: 'code', index: blocksIn(p.root, 'code').indexOf(p.pre), key: blockKey(p.pre) } : null;
    const sameSpace = (h) => code ? h.type === 'code' && h.block && h.block.index === code.index : !h.type;
    // A selection that touches or overlaps a highlight grows it rather than
    // standing on top of it: one entry, the oldest id, the notes kept.
    const over = store.filter(h => sameSpace(h) && h.chunk === chunk && marksOf.has(h.id)
      && h.start <= e && h.end >= s);
    for (const h of over) { s = Math.min(s, h.start); e = Math.max(e, h.end); }
    over.sort((a, b) => (a.created || 0) - (b.created || 0));
    const entry = over[0] || (code
      ? { v: 1, id: newId(), type: 'code', chunk, block: code, note: '', kind: 'mark', created: now }
      : { v: 1, id: newId(), chunk, note: '', kind: 'mark', created: now });
    const notes = over.map(h => h.note || '').filter(n => n.trim());
    for (const h of over) {
      unpaint(h.id);
      if (h !== entry) { store.splice(store.indexOf(h), 1); dropCard(h.id); }
    }
    Object.assign(entry, { start: s, end: e }, quoteParts(p.text, s, e),
      { note: notes.join('\n\n'), edited: now });
    if (!over.length) store.push(entry);
    place(entry);
    const card = cards.get(entry.id);
    if (card) card.querySelector('.rd-note').value = entry.note;
    save();
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideButton();
    setFocus(entry.id, { edit: true, reveal: true });
  };
  const remove = (id) => {
    const i = store.findIndex(h => h.id === id);
    if (i < 0) return;
    const [h] = store.splice(i, 1);
    unpaint(id);
    dropCard(id);
    orphans.delete(id);
    if (focused === id) focused = null;
    save();
    renderFoot();
    layout();
    toast(S['reader-removed'] || '', () => {
      store.splice(Math.min(i, store.length), 0, h);
      place(h);
      save();
      renderFoot();
      layout();
    });
  };
  // ── the button at the end of a selection ──
  let markBtn = null, pending = null, pointerDown = false;
  const hideButton = () => { pending = null; if (markBtn) markBtn.hidden = true; };
  const showButton = (p) => {
    if (!markBtn) {
      markBtn = button('rd-mark-btn', S['reader-mark'] || '');
      markBtn.setAttribute('data-rd-ui', '');
      // Pressing it must not take the selection it is about to mark.
      markBtn.addEventListener('pointerdown', (e) => e.preventDefault());
      markBtn.addEventListener('mousedown', (e) => e.preventDefault());
      markBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const p = pending || fromSelection();
        if (p) make(p);
      });
      body.appendChild(markBtn);
    }
    pending = p;
    markBtn.hidden = false;
    const rects = [...p.range.getClientRects()].filter(r => r.width > 0 || r.height > 0);
    const last = rects[rects.length - 1] || p.range.getBoundingClientRect();
    const w = markBtn.offsetWidth, h = markBtn.offsetHeight, pad = 8;
    let x = last.right - w / 2;
    x = Math.max(pad, Math.min(window.innerWidth - w - pad, x));
    let y = last.bottom + 6;
    if (y + h > window.innerHeight - pad) y = rects.length ? rects[0].top - h - 6 : last.top - h - 6;
    y = Math.max(pad, Math.min(window.innerHeight - h - pad, y));
    // Not on top of the pill, which holds the corner a selection near the
    // foot of the window would put it in: above the selection instead.
    if (!pill.hidden) {
      const pr = pill.getBoundingClientRect();
      if (x < pr.right && x + w > pr.left && y < pr.bottom && y + h > pr.top) {
        y = Math.max(pad, (rects[0] || last).top - h - 6);
      }
    }
    markBtn.style.left = Math.round(x + window.scrollX) + 'px';
    markBtn.style.top = Math.round(y + window.scrollY) + 'px';
  };
  const check = () => {
    // A selection inside a note field is the field's, and rootOf refuses it:
    // the cards are marked as the script's own.
    if (body.classList.contains('lb-open')) { hideButton(); return; }
    const p = fromSelection();
    if (p) showButton(p); else hideButton();
  };
  let checkQueued = false;
  const scheduleCheck = () => {
    if (checkQueued) return;
    checkQueued = true;
    setTimeout(() => { checkQueued = false; if (!pointerDown) check(); }, 60);
  };
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || !e.target.closest('.rd-mark-btn')) pointerDown = true;
  }, true);
  document.addEventListener('pointerup', () => { pointerDown = false; scheduleCheck(); }, true);
  document.addEventListener('pointercancel', () => { pointerDown = false; }, true);
  document.addEventListener('selectionchange', scheduleCheck);

  // ── figures: the corner button, the dots, the lightbox (plan §11) ──
  // A click on a figure opens the lightbox, as it did before. The two ways in
  // stand beside that click rather than changing it: a button in the
  // figure's corner that marks it whole, and in the lightbox, where the
  // figure is large enough to point at, a spot. A click on a dot opens its
  // card and nothing else.
  const newFig = (fig, at) => {
    const root = figRoot(fig);
    if (!root) return null;
    const now = Date.now();
    const entry = { v: 1, id: newId(), type: 'figure', chunk: root.id,
      fig: { index: figsIn(root).indexOf(fig), kind: figKind(fig), key: figKey(fig) },
      at, note: '', kind: 'mark', created: now, edited: now };
    store.push(entry);
    place(entry);
    save();
    renderFoot();
    return entry;
  };
  for (const fig of figsIn(main)) {
    if (!figRoot(fig) || !drawingOf(fig)) continue;
    const b = button('rd-fig-btn', S['reader-mark'] || '');
    b.setAttribute('data-rd-ui', '');
    b.setAttribute('aria-label', S['reader-fig-mark'] || '');
    b.title = S['reader-fig-mark'] || '';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Marked whole already: that entry's card, not a second frame.
      let h = store.find(x => { const v = figs.get(x.id); return v && v.whole && v.fig === fig; });
      if (!h) h = newFig(fig, null);
      if (h) setFocus(h.id, { edit: true, reveal: true });
    });
    fig.appendChild(b);
  }
  // A code block and a display formula carry the same button, and mark
  // the block whole.
  const newBlock = (el) => {
    const root = figRoot(el);
    if (!root) return null;
    const now = Date.now();
    const kind = blockKind(el);
    const entry = { v: 1, id: newId(), type: 'block', chunk: root.id,
      block: { kind, index: blocksIn(root, kind).indexOf(el), key: blockKey(el) },
      note: '', kind: 'mark', created: now, edited: now };
    store.push(entry);
    place(entry);
    save();
    renderFoot();
    return entry;
  };
  for (const el of [...blocksIn(main, 'code'), ...blocksIn(main, 'formula')]) {
    if (!figRoot(el)) continue;
    const b = button('rd-fig-btn', S['reader-mark'] || '');
    b.setAttribute('data-rd-ui', '');
    b.setAttribute('aria-label', S[el.matches('pre') ? 'reader-code-mark' : 'reader-formula-mark'] || '');
    b.title = b.getAttribute('aria-label');
    // The block scrolls, and a focused button taller than a one-line
    // formula would scroll it to show the button, cutting off the
    // formula's superscripts: a mouse press does not focus it, and a
    // keyboard focus puts the block back.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('focus', () => requestAnimationFrame(() => { el.scrollTop = 0; }));
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let h = store.find(x => { const v = blocks.get(x.id); return v && v.el === el; });
      if (!h) h = newBlock(el);
      if (h) setFocus(h.id, { edit: true, reveal: true });
    });
    el.appendChild(b);
  }
  // A dot opens its card, and so does a highlight in a code block: neither
  // opens the lightbox the block around it would.
  document.addEventListener('click', (e) => {
    const t = e.target;
    const pin = t.closest && t.closest('.rd-pin');
    if (pin && main.contains(pin)) {
      e.preventDefault();
      e.stopPropagation();
      setFocus(pin.dataset.hl, { card: true, reveal: true });
      return;
    }
    const m = t.closest && t.closest('pre mark.rd-hl');
    if (m && main.contains(m)) e.preventDefault();
  }, true);
  const pulse = (id) => {
    const d = (marksOf.get(id) || [])[0];
    if (!d) return;
    const r = d.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) d.scrollIntoView({ block: 'center' });
    d.classList.remove('rd-pulse');
    void d.getBoundingClientRect();
    d.classList.add('rd-pulse');
    setTimeout(() => d.classList.remove('rd-pulse'), 1300);
  };

  // The lightbox is PRINT_JS's; this half hears it open and close, and is
  // asked about a click before the click closes it. On a figure it gains a
  // bar with a close button and Mark a spot (also m). Marking, the cursor is
  // a crosshair, the part of a diagram under it is outlined, and a click that
  // did not drag sets a pin and opens its card beside it - the margin card
  // itself, lent to the overlay while it is open, so typing there is typing
  // in the card the page shows when it closes. A drag still pans and the
  // wheel still zooms, marking or not.
  const lb = document.getElementById('psiINT-lightbox');
  let lbFig = null, lbCopy = null, marking = false, lbCard = null, bar = null, spotBtn = null, hover = null;
  const syncLb = () => {
    if (!lbCopy) return;
    stripFig(lbCopy);
    hover = null;
    for (const h of store) {
      const v = figs.get(h.id);
      if (v && v.fig === lbFig) drawFig(h, lbCopy);
    }
  };
  const setHover = (g) => {
    if (hover === g) return;
    if (hover) hover.classList.remove('rd-hover');
    hover = g;
    if (hover) hover.classList.add('rd-hover');
  };
  const setMarking = (on) => {
    marking = !!on && !!lbCopy;
    body.classList.toggle('rd-marking', marking);
    if (spotBtn) spotBtn.setAttribute('aria-pressed', marking ? 'true' : 'false');
    if (!marking) setHover(null);
  };
  const closeLbCard = () => {
    const id = lbCard;
    if (!id) return;
    lbCard = null;
    const c = cards.get(id);
    if (c) { c.classList.remove('rd-lb-card'); c.remove(); }
    if (lb) lb.focus({ preventScroll: true });
    schedule();
  };
  const openLbCard = (id, edit) => {
    const h = byId(id);
    if (!h || !lbCopy) return;
    if (lbCard && lbCard !== id) closeLbCard();
    lbCard = id;
    const card = cardFor(h);
    describe(card, h);
    card.classList.add('rd-lb-card', 'is-focus');
    card.style.left = card.style.top = card.style.width = '';
    lb.appendChild(card);
    grow(card.querySelector('.rd-note'));
    const pin = [...lbCopy.querySelectorAll('.rd-pin')].find(p => p.dataset.hl === id);
    const pr = (pin || lbCopy).getBoundingClientRect();
    const w = card.offsetWidth, ch = card.offsetHeight, pad = 12;
    let x = pr.right + pad;
    if (x + w > window.innerWidth - pad) x = pr.left - pad - w;
    x = Math.max(pad, Math.min(window.innerWidth - w - pad, x));
    const y = Math.max(pad, Math.min(window.innerHeight - ch - pad, pr.top - 8));
    card.style.left = Math.round(x) + 'px';
    card.style.top = Math.round(y) + 'px';
    if (edit) card.querySelector('.rd-note').focus({ preventScroll: true });
    else card.focus({ preventScroll: true });
  };
  const markAt = (x, y) => {
    const d = drawingOf(lbCopy);
    if (!d) return;
    const r = d.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
    const round = (v) => Math.round(Math.max(0, Math.min(1, v)) * 10000) / 10000;
    let at;
    if (d.tagName.toLowerCase() === 'svg') {
      const vb = vbOf(d), p = toUser(d, x, y);
      at = { x: round((p.x - vb.x) / vb.w), y: round((p.y - vb.y) / vb.h) };
      const t = document.elementFromPoint(x, y);
      const g = lbFig.classList.contains('figure-diagram') && t && d.contains(t) && t.closest('.dg-el');
      if (g) at = { el: nameOfPart(d, g), x: at.x, y: at.y };
    } else {
      at = { x: round((x - r.left) / r.width), y: round((y - r.top) / r.height) };
    }
    const h = newFig(lbFig, at);
    setMarking(false);
    if (!h) return;
    setFocus(h.id);
    openLbCard(h.id, true);
  };
  if (lb) {
    lb.addEventListener('lb:open', (e) => {
      const { card, opener } = e.detail || {};
      // Code and formulas are shown as they are, marks and frame with them;
      // only the button in the corner stays behind.
      if (card) for (const b of card.querySelectorAll('.rd-fig-btn')) b.remove();
      if (!opener || !opener.matches(FIG) || !main.contains(opener) || !figRoot(opener)) return;
      lbFig = opener;
      lbCopy = card;
      // A picture is as wide as it can be at its own proportions, so the
      // box a pin is placed against is the picture and not a letterbox.
      const img = drawingOf(opener);
      if (img && img.tagName === 'IMG' && img.naturalWidth && img.naturalHeight) {
        const ci = drawingOf(card);
        if (ci) ci.style.width = 'min(92vw, calc(88vh * ' + (img.naturalWidth / img.naturalHeight).toFixed(4) + '))';
      }
      bar = document.createElement('div');
      bar.className = 'rd-lb-bar';
      bar.setAttribute('data-rd-ui', '');
      spotBtn = button('rd-lb-spot', S['reader-lb-spot'] || '');
      spotBtn.title = (S['reader-lb-spot'] || '') + ' (m)';
      spotBtn.setAttribute('aria-keyshortcuts', 'm');
      spotBtn.dataset.key = 'm';
      const closeBtn = button('rd-lb-close', '×');
      closeBtn.setAttribute('aria-label', S['reader-lb-close'] || '');
      closeBtn.title = S['reader-lb-close'] || '';
      bar.append(spotBtn, closeBtn);
      bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      spotBtn.addEventListener('click', () => setMarking(!marking));
      closeBtn.addEventListener('click', () => lb.dispatchEvent(new CustomEvent('lb:dismiss')));
      lb.appendChild(bar);
      setMarking(false);
      syncLb();
    });
    lb.addEventListener('lb:close', () => {
      const id = lbCard;
      setMarking(false);
      lbCard = null;
      lbFig = lbCopy = bar = spotBtn = null;
      if (id) {
        const c = cards.get(id);
        if (c) { c.classList.remove('rd-lb-card'); c.remove(); }
        setFocus(id, { card: true });
      } else {
        schedule();
      }
    });
    lb.addEventListener('lb:click', (e) => {
      if (!lbCopy) return;
      const { x, y } = e.detail;
      const t = document.elementFromPoint(x, y);
      const pin = t && t.closest && t.closest('.rd-pin');
      if (pin && lbCopy.contains(pin)) { e.preventDefault(); openLbCard(pin.dataset.hl, false); return; }
      if (marking) { e.preventDefault(); markAt(x, y); return; }
      if (lbCard) { e.preventDefault(); closeLbCard(); }
    });
    lb.addEventListener('pointermove', (e) => {
      if (!marking || e.buttons || !lbCopy) return;
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const d = drawingOf(lbCopy);
      setHover(lbFig.classList.contains('figure-diagram') && t && d && d.contains(t) && !t.closest(UI)
        ? t.closest('.dg-el') : null);
    });
    // Ahead of the lightbox's own keys: m, and an Esc that first puts away
    // the card, then the crosshair, and only then the overlay.
    document.addEventListener('keydown', (e) => {
      if (!lbCopy || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (e.key === 'Escape') {
        if (lbCard) { e.preventDefault(); e.stopPropagation(); closeLbCard(); }
        else if (marking) { e.preventDefault(); e.stopPropagation(); setMarking(false); }
        return;
      }
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (e.key === 'm' && !e.shiftKey) { e.preventDefault(); setMarking(!marking); }
    }, true);
  }

  // ── events on highlights and cards ──
  document.addEventListener('input', (e) => {
    const ta = e.target.closest && e.target.closest('.rd-note');
    if (!ta) return;
    const card = ta.closest('.rd-card');
    const h = card && byId(card.dataset.hl);
    if (!h) return;
    h.note = ta.value;
    h.edited = Date.now();
    noteMarks(h);
    grow(ta);
    save();
    schedule();
  });
  document.addEventListener('focusin', (e) => {
    const card = e.target.closest && e.target.closest('.rd-card');
    if (card && card.dataset.hl !== focused) setFocus(card.dataset.hl);
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t.closest) return;
    const orphanBtn = t.closest('.rd-orphan-remove');
    if (orphanBtn) { remove(orphanBtn.dataset.hl); return; }
    const card = t.closest('.rd-card');
    if (card) {
      if (t.closest('.rd-remove')) remove(card.dataset.hl);
      // A figure's card shows where on the figure it is.
      else if (!t.closest('textarea, button') && !card.closest('#psiINT-lightbox')
               && (figs.has(card.dataset.hl) || blocks.has(card.dataset.hl))) pulse(card.dataset.hl);
      return;
    }
    if (t.closest(UI + ', #psiINT-reader-contents, .rd-toggle, #psiINT-lightbox')) return;
    const mark = t.closest('mark.rd-hl');
    const sel = window.getSelection && window.getSelection();
    const selecting = sel && !sel.isCollapsed && String(sel).trim();
    // A link inside a highlight is still a link.
    if (mark && !selecting && !t.closest('a')) { setFocus(mark.dataset.hl, { card: true, reveal: true }); return; }
    if (focused && !selecting) setFocus(null);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !focused) return;
    if (body.classList.contains('lb-open') || body.classList.contains('rd-open')) return;
    const a = document.activeElement;
    if (a && a.closest && a.closest('.rd-card')) a.blur();
    setFocus(null);
  });
  // Another tab with the same store - the other document, where the browser
  // shares one - wrote to it: take its version and paint again.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    for (const h of store) unpaint(h.id);
    store = parse(e.newValue);
    const live = new Set(store.map(h => h.id));
    for (const id of [...cards.keys()]) if (!live.has(id)) dropCard(id);
    if (focused && !live.has(focused)) focused = null;
    for (const h of store) {
      place(h);
      const card = cards.get(h.id);
      if (card) {
        const ta = card.querySelector('.rd-note');
        if (document.activeElement !== ta) ta.value = h.note || '';
      }
    }
    renderFoot();
    layout();
  });

  placeAll();
  renderFoot();
  schedule();
})();
