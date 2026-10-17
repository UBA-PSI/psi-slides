
const DG_LIST = [];
const DG_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DG_DUR = 380;

// The one text that draws the non-rectangular outlines, lifted straight out
// of diagram-core.mjs rather than transcribed. The build emits the opening
// beat with this function and the runtime redraws every later beat with it,
// so the two cannot drift; a hand copy here would be a second vocabulary
// nobody would think to keep in step.
// Keyed by the outline alone; a drawable kind may carry a direction after a
// colon (`chevron:up`), which dgShapeD reads and this lookup must not.
// Filled in by the build from DG_SHAPE_CLASSES rather than spelled out – a fifth
// outline added to the table would otherwise draw at build time and be
// unknown to the very runtime that has to move it.
const DG_SHAPES = __PSI_DG_SHAPES__;
/*__PSI_DG_SHAPE_D__*/
/*__PSI_DG_PATH_D__*/
/*__PSI_DG_SPLINE_D__*/
// Every frame after the first arrives as what changed since the one before;
// this makes them whole again, in place, once (see diagram-core.mjs). Called
// by every reader here, and by the editor and the figures page through them.
/*__PSI_DG_FULL_FRAMES__*/

// A live view shows the box that holds every beat, and - on an ordinary
// figure chunk - the canvas the slide reserves for a drawing, which is wider
// and taller than the picture inside it. Neither is the box the documents
// show, which is tight around the finished drawing.
//
// Two things move together when that box is swapped in, and only two: the
// viewBox and the intrinsic height that keeps its proportion. Both are
// ATTRIBUTES, which is the whole reason a runtime is involved - the three
// numbers a stylesheet needs (--dg-live-type-w, --dg-live-ar,
// --dg-live-ink-x) are emitted beside the print ones and picked with a
// var() fallback, so nothing about a figure's SIZE waits for this function.
// It used to set --dg-ink-x here and the first version left the property
// behind in the editor's path, so a figure jumped sideways the moment it was
// edited; a value the compiler writes into the markup cannot be left behind.
function dgUseLiveViewBox(svg) {
  svg.setAttribute('viewBox', svg.dataset.liveViewbox);
  const w = Number(svg.getAttribute('width'));
  const r = Number(svg.dataset.liveRatio);
  if (w && r) svg.setAttribute('height', String(Math.round(w * r)));
}

function dgApplyVec(el, kind, v) {
  if (kind === 'rect') {
    el.setAttribute('x', v[0]); el.setAttribute('y', v[1]);
    el.setAttribute('width', Math.max(0, v[2])); el.setAttribute('height', Math.max(0, v[3]));
  } else if (DG_SHAPES[String(kind).split(':')[0]]) {
    // Same four numbers a rect carries, joined into a different outline. That
    // is the whole reason a hexagon costs nothing here: it tweens as a rect
    // does, and only the last step – turning the vector into a path – differs.
    el.setAttribute('d', dgShapeD(kind, v[0], v[1], Math.max(0, v[2]), Math.max(0, v[3])));
  } else if (kind === 'circle') {
    el.setAttribute('cx', v[0]); el.setAttribute('cy', v[1]); el.setAttribute('r', Math.max(0, v[2]));
  } else if (kind === 'spline') {
    el.setAttribute('d', dgSplineD(v));
  } else if (kind === 'path') {
    let d = '';
    for (let i = 0; i < v.length; i += 2) d += (i ? 'L' : 'M') + v[i] + ' ' + v[i + 1];
    el.setAttribute('d', d + (el.classList.contains('dg-head') ? 'Z' : ''));
  } else {
    // A label. The optional third number is the turn, so a rotated one is
    // carried, interpolated and applied by the very same machinery that moves
    // an upright one - no class lookup at step time, no second code path.
    el.setAttribute('transform', 'translate(' + v[0] + ',' + v[1] + ')'
      + (v[2] ? ' rotate(' + v[2] + ')' : ''));
  }
}

function dgTargets(d, key) {
  if (d.cache[key]) return d.cache[key];
  // Label wrappers are addressed by data-lab, not by id, because one
  // element can carry several pre-rendered label variants. The attribute
  // holds the full geometry key.
  const list = key.endsWith('--l')
    ? [...d.svg.querySelectorAll('[data-lab="' + key + '"]')]
    : [document.getElementById(d.data.p + key)].filter(Boolean);
  d.cache[key] = list;
  return list;
}

// Discrete state – visibility, classes, which label variant is on – lands
// at once. Only geometry is worth interpolating; a class that fades is a
// class that is wrong for half the transition.
function dgApplyDiscrete(d, frame) {
  for (const id in frame.vis) {
    const g = document.getElementById(d.data.p + id);
    if (!g) continue;
    g.style.opacity = frame.vis[id];
    const base = g.dataset.base || '';
    const extra = frame.cls[id] || '';
    g.setAttribute('class', extra ? base + ' ' + extra : base);
    if (id in frame.lab) {
      d.svg.querySelectorAll('[data-lab="' + id + '--l"]').forEach((w, i) => {
        w.classList.toggle('dg-off', i !== frame.lab[id]);
      });
    }
  }
}

function dgApplyGeom(d, from, to, f) {
  const now = {};
  for (const key in to) {
    const b = to[key];
    const a = from[key] || b;
    const v = new Array(b.length);
    for (let i = 0; i < b.length; i++) {
      const av = a[i] === undefined ? b[i] : a[i];
      v[i] = Math.round((av + (b[i] - av) * f) * 100) / 100;
    }
    now[key] = v;
    const kind = d.data.kinds[key];
    for (const el of dgTargets(d, key)) dgApplyVec(el, kind, v);
  }
  return now;
}

// Paint a frame into a copy of the diagram that is not the live one - the
// speaker's preview thumbnails. Resolves ids inside the given root rather
// than through getElementById, because a clone carries duplicate ids and
// the document would hand back the original every time.
function dgRenderInto(root, d, step) {
  dgFullFrames(d.data);
  const frame = d.data.frames[Math.max(0, Math.min(d.data.n - 1, step))];
  if (!frame) return;
  for (const id in frame.vis) {
    const g = root.querySelector('[id="' + d.data.p + id + '"]');
    if (!g) continue;
    g.style.opacity = frame.vis[id];
    const base = g.dataset.base || '';
    const extra = frame.cls[id] || '';
    g.setAttribute('class', extra ? base + ' ' + extra : base);
    if (id in frame.lab) {
      root.querySelectorAll('[data-lab="' + id + '--l"]').forEach((w, i) => {
        w.classList.toggle('dg-off', i !== frame.lab[id]);
      });
    }
  }
  for (const key in frame.geom) {
    const els = key.endsWith('--l')
      ? [...root.querySelectorAll('[data-lab="' + key + '"]')]
      : [root.querySelector('[id="' + d.data.p + key + '"]')].filter(Boolean);
    for (const el of els) dgApplyVec(el, d.data.kinds[key], frame.geom[key]);
  }
}

function dgStep(d, step, instant) {
  dgFullFrames(d.data);
  step = Math.max(0, Math.min(d.data.n - 1, step | 0));
  const frame = d.data.frames[step];
  const same = d.step === step && d.cur;
  d.step = step;
  dgApplyDiscrete(d, frame);
  // The focus card is a *clone* of the figure, ids and all, so every
  // getElementById above reaches the hidden original and the card - the only
  // thing the room can see - never moves. Paint it the same way the
  // speaker's preview thumbnails are painted, by resolving inside that root.
  dgMirrorIntoFocus(d, step);
  if (d.hint) {
    const next = d.data.names[step];
    d.hint.textContent = next ? 'next: ' + next : '';
  }
  if (same) return;
  const from = d.cur || frame.geom;
  cancelAnimationFrame(d.raf);
  if (instant || DG_REDUCED) { d.cur = dgApplyGeom(d, frame.geom, frame.geom, 1); return; }
  const t0 = performance.now();
  const tick = (now) => {
    const f = Math.min(1, (now - t0) / DG_DUR);
    const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    d.cur = dgApplyGeom(d, from, frame.geom, e);
    if (f < 1) d.raf = requestAnimationFrame(tick);
  };
  d.raf = requestAnimationFrame(tick);
}

// What may stand in a figure that arrives as markup. An allow-list, because
// the list of what can run inside an SVG is longer than anyone keeps up to
// date: a blocklist of on* and javascript: let a <foreignObject> through, and
// an <iframe srcdoc> inside it ran its script on the projection. The first
// row is what the compiler and the build's image leaf emit (measured over
// every figure in the repository and in the content decks); the rest is the
// static drawing vocabulary a vector asset spliced into a figure may carry -
// shapes, gradients, clips, masks, markers, filters. Nothing that runs,
// fetches a document, animates or links: no script, foreignObject, iframe,
// a, animate, animateMotion, animateTransform, set, feImage.
const DG_SAFE_EL = new Set(('svg g path rect circle text tspan image title symbol use style '
  + 'defs desc line polyline polygon ellipse textPath linearGradient radialGradient stop '
  + 'pattern clipPath mask marker filter feBlend feColorMatrix feComponentTransfer '
  + 'feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight '
  + 'feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge '
  + 'feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight '
  + 'feTile feTurbulence').split(' '));
// Attributes: geometry, presentation and structure. data-* and aria-* are
// allowed by prefix; an on* handler is simply not on the list. The two href
// spellings are judged by value in dgSafeHref.
const DG_SAFE_ATTR = new Set(('id class style role transform xmlns xmlns:xlink xml:space '
  + 'x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height d points dx dy rotate '
  + 'textLength lengthAdjust startOffset method spacing side viewBox preserveAspectRatio '
  + 'pathLength offset gradientUnits gradientTransform spreadMethod patternUnits '
  + 'patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits '
  + 'markerWidth markerHeight markerUnits refX refY orient filterUnits primitiveUnits '
  + 'in in2 result stdDeviation mode operator k1 k2 k3 k4 values type tableValues slope '
  + 'intercept amplitude exponent kernelMatrix order divisor bias targetX targetY '
  + 'edgeMode preserveAlpha scale xChannelSelector yChannelSelector baseFrequency '
  + 'numOctaves seed stitchTiles radius surfaceScale diffuseConstant specularConstant '
  + 'specularExponent kernelUnitLength azimuth elevation z pointsAtX pointsAtY pointsAtZ '
  + 'limitingConeAngle version baseProfile '
  + 'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap '
  + 'stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity '
  + 'clip-path clip-rule mask filter color display visibility overflow font-family '
  + 'font-size font-size-adjust font-stretch font-style font-variant font-weight '
  + 'text-anchor dominant-baseline alignment-baseline baseline-shift letter-spacing '
  + 'word-spacing text-decoration paint-order vector-effect shape-rendering '
  + 'text-rendering image-rendering color-interpolation color-interpolation-filters '
  + 'stop-color stop-opacity marker-start marker-mid marker-end writing-mode direction '
  + 'unicode-bidi flood-color flood-opacity lighting-color isolation mix-blend-mode '
  + 'pointer-events transform-origin').split(' '));
function dgSafeHref(tag, v) {
  // Browsers drop control characters and spaces from a URL before reading
  // its scheme, so the test does too.
  const s = String(v || '').replace(/[\u0000-\u0020]/g, '');
  if (s.charAt(0) === '#') return tag !== 'image';
  if (tag !== 'image') return false;
  // A picture: inlined, beside the page, or on the web. An <image> is drawn
  // in a mode that runs no script, so the scheme is the whole question.
  return /^data:image\//i.test(s) || /^https?:\/\//i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s);
}
// A spliced asset's <style> is wrapped by the build in an @scope on the
// asset's own root (inlineSvg), with @font-face hoisted beside it. That is
// the shape kept: every top-level block that is an @scope on an svg inside
// this figure, or an @font-face. Anything else - a bare rule, an @import, a
// scope on some other element - would style the page around the figure,
// and is dropped. Returns null when nothing had to go, so a stylesheet that
// passes keeps its text byte for byte.
function dgScopedCss(css, ids) {
  const n = css.length;
  const keep = [];
  let dropped = false;
  const atom = (j) => {
    const c = css[j];
    if (c === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); return e < 0 ? n : e + 2; }
    if (c === '"' || c === "'") {
      let k = j + 1;
      while (k < n && css[k] !== c) { if (css[k] === '\\') k++; k++; }
      return k + 1;
    }
    if (c === '\\') return j + 2;
    return -1;
  };
  let i = 0;
  while (i < n) {
    let p = i;
    while (p < n && css[p] !== '{' && css[p] !== ';' && css[p] !== '}') {
      const s = atom(p); p = s < 0 ? p + 1 : s;
    }
    const prelude = css.slice(i, Math.min(p, n)).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (p >= n) { if (prelude) dropped = true; break; }
    if (css[p] !== '{') { dropped = true; i = p + 1; continue; }
    let q = p + 1, depth = 1;
    while (q < n && depth > 0) {
      const s = atom(q);
      if (s >= 0) { q = s; continue; }
      if (css[q] === '{') depth++;
      else if (css[q] === '}') depth--;
      q++;
    }
    const m = /^@scope\s*\(\s*svg#([A-Za-z0-9_-]+)\s*\)$/.exec(prelude);
    if ((m && ids.has(m[1])) || /^@font-face$/i.test(prelude)) keep.push(css.slice(i, q).trim());
    else dropped = true;
    i = q;
  }
  return dropped ? keep.join('\n') : null;
}
function dgCleanSvg(root) {
  const NS = 'http://www.w3.org/2000/svg';
  const all = [root, ...root.querySelectorAll('*')];
  const gone = new Set();
  for (const el of all) {
    if (el.parentNode && gone.has(el.parentNode)) { gone.add(el); continue; }
    if (el.namespaceURI !== NS || !DG_SAFE_EL.has(el.localName)) { gone.add(el); continue; }
    for (const a of [...el.attributes]) {
      const name = a.name;
      const ok = /^(data|aria)-[a-z0-9_.-]*$/i.test(name)
        ? true
        : (name === 'href' || name === 'xlink:href')
          ? dgSafeHref(el.localName, a.value)
          : DG_SAFE_ATTR.has(name);
      if (!ok) el.removeAttribute(name);
    }
  }
  for (const el of gone) if (el !== root) el.remove();
  if (gone.has(root)) return false;
  const ids = new Set([...root.querySelectorAll('svg[id]')].map((s) => s.id));
  if (root.id) ids.add(root.id);
  for (const st of root.querySelectorAll('style')) {
    const css = dgScopedCss(st.textContent, ids);
    if (css !== null) st.textContent = css;
  }
  return true;
}

// Swap one diagram for a freshly compiled copy of itself – the DOM half of
// an applied edit. Shared: the editor calls it after compiling in this
// window, and the diagram-edit receiver in a view that ships no editor
// (editor: speaker) calls it with the markup the cockpit sent along. One
// text, or the two swap paths would drift.
function dgSwapFigure(oldSvg, html) {
  // Parsed into a template, never into a div: a detached div still belongs
  // to this document, and an <img onerror> in it fires without ever being
  // attached. A template's content has no window, so nothing in it loads or
  // runs. Only two things are taken out of it, the drawing and its frames
  // payload, and both are cut down to what a figure is made of before either
  // reaches the page (dgCleanSvg). The payload is data - a script element
  // that is not JSON is not one.
  const holder = document.createElement('template');
  holder.innerHTML = html;
  const next = holder.content.querySelector('svg.psi-diagram');
  let payload = holder.content.querySelector('script.psi-diagram-frames');
  if (!next || !dgCleanSvg(next)) return null;
  if (payload) {
    if (payload.getAttribute('type') !== 'application/json') payload = null;
    else for (const a of [...payload.attributes]) {
      if (a.name !== 'type' && a.name !== 'class' && a.name !== 'data-for') payload.removeAttribute(a.name);
    }
  }
  const live = oldSvg.psiDiagram;
  if (next.dataset.liveViewbox) dgUseLiveViewBox(next);
  const figure = oldSvg.closest('.figure-diagram');
  oldSvg.replaceWith(next);
  // The frames payload is what the step runtime reads. Replace it alongside
  // the drawing, or a figure that just gained steps has none the runtime can
  // see, while one that lost them keeps applying geometry from a picture
  // that no longer exists.
  const oldPayload = figure ? figure.querySelector('script.psi-diagram-frames') : null;
  if (payload) {
    payload.dataset.for = next.id;
    if (oldPayload) oldPayload.replaceWith(payload);
    else if (figure) figure.appendChild(payload);
  } else if (oldPayload) {
    oldPayload.remove();
  }
  let d = null;
  if (payload) {
    try {
      const data = JSON.parse(payload.textContent);
      d = live || { svg: next, step: 0, raf: 0, cur: null, cache: {},
        hint: figure ? figure.querySelector('.dg-hint') : null };
      d.data = data;
      d.svg = next;
      d.cache = {};
      d.cur = null;
      next.psiDiagram = d;
      if (!live) DG_LIST.push(d);
      dgStep(d, Math.min(d.step, data.n - 1), true);
    } catch (e) { d = null; }
  } else if (live) {
    // No steps any more: nothing left to tween, and the static attributes
    // the emitter wrote are already the finished picture.
    next.psiDiagram = null;
  }
  // The focus card holds a clone, ids and all, and it is what the room is
  // actually looking at while a figure is zoomed – the very state an edit
  // is usually made in. dgMirrorIntoFocus can only repaint ids that
  // survived the edit, so a structural change replaces the clone whole.
  const card = document.querySelector('#psiINT-figure-overlay .figure-focus-target');
  if (card) {
    const shown = card.querySelector('svg.psi-diagram');
    if (shown && shown.id === next.id) {
      const clone = next.cloneNode(true);
      shown.replaceWith(clone);
      if (d) dgRenderInto(clone, d, d.step);
    }
  }
  return next;
}

// Repaint whatever diagram is currently zoomed into the focus card. Cheap and
// unconditional: one querySelector when nothing is focused.
function dgMirrorIntoFocus(d, step) {
  const card = document.querySelector('#psiINT-figure-overlay .figure-focus-target');
  if (!card) return;
  const svg = card.querySelector('svg.psi-diagram');
  if (!svg || svg.id !== d.svg.id) return;
  dgRenderInto(svg, d, step);
}

function initDiagrams() {
  // Every figure that has a live box, stepped or not. It used to be done
  // inside the loop below, which walks the FRAMES payloads - so a figure with
  // no steps never got one, and the day a still figure acquired a live box
  // (the slide's canvas) it was laid out at the canvas's proportion and drawn
  // at its own: the picture sat in the middle of the reserved rectangle at
  // whatever scale the two aspect ratios happened to differ by.
  document.querySelectorAll('svg.psi-diagram[data-live-viewbox]')
    .forEach(svg => dgUseLiveViewBox(svg));
  document.querySelectorAll('script.psi-diagram-frames').forEach(sc => {
    const svg = document.getElementById(sc.dataset.for);
    if (!svg) return;
    let data;
    try { data = JSON.parse(sc.textContent); } catch (e) { return; }
    // The static viewBox is the print one – tight around the finished
    // picture. A live view has to hold every frame instead, or an element
    // that walks in from outside is clipped for the whole of its journey.
    // Swapped above rather than emitted, so a view with no JavaScript keeps
    // the still it is going to show.
    const fig = svg.closest('.figure-diagram');
    const d = {
      svg, data, step: -1, raf: 0, cur: null, cache: {},
      hint: fig ? fig.querySelector('.dg-hint') : null,
    };
    svg.psiDiagram = d;
    DG_LIST.push(d);
    // A diagram inside an expansion consumes no beats – chunkBeats skips
    // expansion bodies, or Space would advance a counter while the room
    // sees nothing move – so nothing ever steps it. Rewinding it to its
    // opening beat therefore left it half-drawn for good, while print, with
    // no JavaScript at all, showed the finished picture. Where no beat can
    // reach, the finished picture is the one to show. Same selector as
    // chunkBeats, so the two answers cannot disagree.
    const beatless = svg.closest('.exp-body, .chunk-expansion');
    dgStep(d, beatless ? d.data.n - 1 : 0, true);
  });
}
