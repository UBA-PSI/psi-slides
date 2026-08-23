// The diagram compiler, and the one part of the rendering stack that has to
// run in two places.
//
// `build.js` is deliberately one file – the whole rendering stack, parser,
// renderers, CSS and runtime JS. This module is the documented exception,
// and the reason is narrow: the graphical editor answers a drag by rewriting
// the source and re-running the compiler *in the browser*, so exactly one
// text has to compile a diagram in Node and in the page. Two copies of a
// 2,000-line compiler is not a duplication anyone can maintain.
//
// It also **removes** a duplication rather than adding one. `lint.js` is
// zero-dep and standalone by design, and this module has zero dependencies
// of its own, so the linter imports the vocabulary tables instead of
// mirroring them by hand – thirteen tables that used to have to change in
// two files in one commit.
//
// **Pure JavaScript. No imports, no Node APIs, no DOM.** The four leaves
// that were Node-only are injected by the caller (see
// createDiagramCompiler); everything else in here is arithmetic and string
// building. If you find yourself reaching for `fs` or `document`, the thing
// you are writing belongs on the other side of that boundary.
//
// Navigate by the `// ── section ──` banners, the same convention build.js
// uses. The design rationale for the compiler itself is in PRD.md §4.6a and
// CLAUDE.md § Animated infographics; what is here is the code.


// ── diagrams (::: diagram) ──────────────────────────────────────────
// A boxes-and-arrows compiler. The source is a line-oriented DSL in the
// lecture markdown; the output is one inline <svg> plus, when the author
// wrote steps, a payload of precomputed per-step geometries that the live
// runtime tweens between.
//
// Three decisions carry the design:
//
// 1. **No constraint solver.** Positions are expressions over a tiny
//    algebra – a grid cell, an anchor on another element, an offset – so
//    the dependency structure is a DAG and resolves by one topological
//    walk. A solver (Constrain, Cassowary) buys generality we do not need
//    and pays for it with non-local failure: an over-constrained system
//    renders plausibly-wrong and reports a residual rather than a line
//    number. Here a mistake names its line.
//
// 2. **Layout runs once per step, at build time.** An animation is not a
//    separate mechanism bolted onto a static picture; a step is just
//    another evaluation of the same layout with different inputs. That is
//    what makes an arrow follow a box that moved – the arrow never stored
//    coordinates, it stored "the right edge of mix".
//
// 3. **The runtime interpolates numbers, nothing else.** No layout, no
//    solver, no geometry in the browser. Every drawable reduces to one of
//    four kinds (rect, circle, path, text) carrying a vector of numbers,
//    and a step transition is a lerp between two vectors. That is why
//    arrowheads are emitted as filled paths rather than SVG markers: a
//    computed head rotates correctly when its endpoints move, and it
//    sidesteps the marker/context-stroke colour question entirely.
//
// The static attributes in the emitted SVG hold the *print* state, so a
// view with no JavaScript – print.html, print-notes.html, view-source –
// shows the finished diagram rather than its opening step.

export const DG_UNIT = [120, 72];     // default grid cell, px
export const DG_FONT = 15;            // base label size, px
export const DG_LINE_H = 1.25;        // line height, multiples of font size
export const DG_PAD_X = 13;           // box padding, px
export const DG_PAD_Y = 9;
export const DG_MIN_W = 54;           // a box never narrows past this
export const DG_HEAD = 9;             // arrowhead length, px
export const DG_MARGIN = 12;          // viewBox breathing room, px
// Nominal intrinsic width. Deliberately wider than any chunk measure so
// that max-width: 100% always binds – see the comment where it is emitted.
export const DG_NOMINAL_W = 2000;
// How far off an axis a line may run before it reads as a mistake rather
// than a direction. Anything genuinely diagonal is far outside this.
export const DG_SKEW_DEG = 4;
export const DG_BRACE_TICK = 7;       // how far a brace's end ticks turn in, px
export const DG_DOT_R = 13;           // default radius of a `dot`

// Closed vocabulary. Unknown class is an error, not a silent no-op – the
// same rule VALID_TAGS follows, and for the same reason: a typo that only
// costs you the styling is invisible until it is on a projector.
export const DG_CLASSES = new Set([
  // fills. `.clear` is a see-through interior: `.bare` removes the *stroke*,
  // so without it there was no way to draw a frame you can read through.
  // `.paper` is the canvas colour, and it is not the no-op it looks like:
  // it is a box's default, but a box under `default box {.tone-3}` had no
  // way back to it, and a free `text` could not have one at all – which is
  // the whole reason to give a label a ground, so it can knock out a line
  // running behind it.
  'tone-1', 'tone-2', 'tone-3', 'tone-4', 'clear', 'paper', 'accent', 'muted', 'ghost',
  // strokes
  'dashed', 'dotted', 'thick', 'bare',
  // shape
  'round', 'sharp',
  // type. `.serif` is the upright serif; `.hand` is the same family forced
  // italic and accented, and until there was a plain one the family was
  // reachable only through the annotation voice.
  'mono', 'serif', 'hand', 'small', 'large', 'bold',
  // type that fits the box it is in, rather than the box fitting the type
  'fit', 'shrink',
  // text alignment (free `text` only)
  'left', 'right',
  // edges
  'no-head', 'both-heads',
  // set by steps, but authorable as an initial state too
  'emph', 'dim',
]);
// Classes that occupy the same slot. Needed only for the default block,
// and it is what makes it behave the way anyone would expect: an element
// that says .tone-1 must *displace* a `default box {.tone-4}`, not stack
// with it. Stacking left both rules matching at equal specificity, so the
// one written later in the stylesheet won and the author's explicit choice
// silently lost.
export const DG_CLASS_GROUPS = [
  ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'clear', 'paper'],   // fill
  ['accent', 'muted'],                        // ink
  ['dashed', 'dotted'],                       // stroke pattern
  ['thick', 'bare'],                          // stroke weight
  ['round', 'sharp'],                         // corner
  ['small', 'large'],                         // size
  ['mono', 'serif', 'hand'],                  // family
  ['fit', 'shrink'],                          // how type meets its box
  ['left', 'right'],                          // text alignment
];
// Not one slot, but the pair is still a mistake with no visible cause:
// .tone-4 fills with the accent and inverts its own label, so accent ink on
// it is invisible. The stylesheet arbitrates in favour of the inversion (the
// inversion rule is written after the accent one); the author should hear
// about it rather than wonder where the words went.
export const DG_CLASS_CLASHES = [['tone-4', 'accent']];

export const DG_ANCHORS = new Set(['left', 'right', 'top', 'bottom', 'center', 'tl', 'tr', 'bl', 'br']);
// The statements that bring an element into being, as opposed to arranging
// or restyling ones that already exist. Not used by the compiler – it
// branches on each keyword by name – but the linter needs the set, and a
// second hand-written copy of the vocabulary is exactly what this module
// exists to stop.
export const DG_DEFINES = new Set(['box', 'dot', 'text', 'image', 'brace', 'container']);
// Scalar coordinates of an element, for use where a single number would go.
// `left`/`right` are x, `top`/`bottom` are y, `cx`/`cy` the centres. Naming
// the wrong axis is an error rather than a silent transposition.
export const DG_SCALAR_X = new Set(['cx', 'left', 'right']);
export const DG_SCALAR_Y = new Set(['cy', 'top', 'bottom']);

export const DG_STEP_OPS = new Set(['show', 'hide', 'move', 'emph', 'calm', 'style', 'label']);
export const DG_KEYWORDS = new Set(['box', 'dot', 'text', 'image', 'edge', 'brace', 'container', 'align', 'spread', 'default', 'step']);
// Figma's and PowerPoint's edge words, but with the axis stated:
// `align x center` / `align y middle`. Naming the axis costs one token and
// removes a trap that caught its own author – "center" and "middle" are
// near-synonyms in English, the axis is not in the word, and aligning the
// wrong one is legal, silent, and moves a whole block into the next column.
// It also matches `spread x|y`, which named its axis from the start.
export const DG_ALIGN_X = new Set(['left', 'center', 'right']);
export const DG_ALIGN_Y = new Set(['top', 'middle', 'bottom']);
export const DG_DEFAULT_KINDS = new Set(['box', 'dot', 'text', 'image', 'edge', 'container', 'brace']);
// What `default <kind>` may set, per kind: exactly the geometric options that
// kind's own statement accepts. Anything else used to parse and then do
// nothing – `default box r 5` is not an error anyone can see, and a silent
// no-op is the failure mode this DSL keeps closing.
export const DG_BRACE_SIDES = ['right', 'left', 'top', 'bottom'];
// `pad` on a box or a text is the same sentence it already is on a container
// and a brace – how far the outline sits from what it encloses – so it needs
// no keyword of its own. One number in grid units, and like the container's
// it is measured in *uh* on both axes, or the same word would mean two
// different distances depending on which statement it sat on.
export const DG_KIND_OPTS = {
  box: ['w', 'h', 'pad'], text: ['w', 'h', 'pad'], image: ['w', 'h'], dot: ['r'],
  container: ['pad'], brace: ['pad'], edge: [],
};
export const DG_PAD_DEFAULT = 0.18;   // container / brace clearance, in grid units

export function dgErr(errors, line, msg) { errors.push({ line, msg }); }

// Layout runs once per step, so the same complaint would otherwise be
// printed once per frame. Reset per build alongside dgCounter.
// ── text metrics ────────────────────────────────────────────────────
// There is no browser at build time, so label widths are estimated from a
// per-character advance table. It is deliberately a little generous: a box
// slightly wider than its text reads as designed, a box slightly narrower
// reads as broken. `w` on the element overrides it whenever the estimate
// is not good enough.
export const DG_NARROW = new Set([...'ijltI.,:;\'"`|!()[]{}/\\ -']);
export const DG_WIDE = new Set([...'mwMWQ@%']);
export function dgCharW(ch) {
  if (DG_NARROW.has(ch)) return 0.34;
  if (DG_WIDE.has(ch)) return 0.92;
  if (ch >= 'A' && ch <= 'Z') return 0.68;
  if (ch >= '0' && ch <= '9') return 0.56;
  return 0.53;
}

// Labels carry `_sub` and `^sup` because these diagrams are full of c_0,
// m_1, MAC_k. Full KaTeX is deliberately not wired in here: it emits HTML,
// which inside an <svg> would mean a <foreignObject>, which would take the
// label out of the SVG coordinate system the tween operates on.
// `*accent*` and `~muted~` toggle a colour inside a label. Rebuilding a real
// slide is what argued for them: one sentence with three colour changes
// ("Security goals: integrity and authenticity but not non-repudiation")
// otherwise needs six separate `text` elements chained with `right of`,
// which is unreadable as source and re-flows badly the moment a word
// changes. An unmatched marker is left as a literal character, so a lone
// asterisk in a label is still just an asterisk.
export function dgSpans(text) {
  const out = [];
  let buf = '';
  let cls = '';
  const flush = (shift) => { if (buf) { out.push({ t: buf, shift, cls }); buf = ''; } };
  const closes = (marker, from) => text.indexOf(marker, from) >= 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ((ch === '*' || ch === '~')) {
      const want = ch === '*' ? 'em' : 'mu';
      if (cls === want) { flush(0); cls = ''; continue; }
      if (!cls && closes(ch, i + 1)) { flush(0); cls = want; continue; }
      // no closing marker – a literal character
    } else if ((ch === '_' || ch === '^') && i + 1 < text.length) {
      flush(0);
      const shift = ch === '_' ? -1 : 1;
      i++;
      if (text[i] === '{') {
        const end = text.indexOf('}', i);
        if (end < 0) { buf = ch; continue; }
        out.push({ t: text.slice(i + 1, end), shift, cls });
        i = end;
      } else {
        out.push({ t: text[i], shift, cls });
      }
      continue;
    }
    buf += ch;
  }
  flush(0);
  return out;
}

export function dgMeasure(label, fontPx, mono) {
  const lines = String(label ?? '').split('\n');
  let maxW = 0;
  const laid = lines.map(ln => {
    const spans = dgSpans(ln);
    let w = 0;
    for (const s of spans) {
      const size = s.shift ? fontPx * 0.72 : fontPx;
      for (const ch of s.t) w += (mono ? 0.6 : dgCharW(ch)) * size;
    }
    if (w > maxW) maxW = w;
    return spans;
  });
  return { w: maxW, h: lines.length * fontPx * DG_LINE_H, lines: laid, count: lines.length };
}

// Height-to-width of an asset, so an author can give `w` and let the other
// dimension follow. SVG answers from its viewBox (or its width/height);
// raster goes through the same zero-dep PNG/JPEG header reader the image
// optimiser uses. Anything else has to say `h` itself.
export function dgOpacity(visible, classes) {
  if (!visible) return 0;
  const has = (c) => (classes.has ? classes.has(c) : classes.includes(c));
  if (has('dim')) return 0.3;
  if (has('ghost')) return 0.45;
  return 1;
}

export function dgFontFor(classes) {
  let size = DG_FONT;
  if (classes.has('small')) size = DG_FONT * 0.8;
  if (classes.has('large')) size = DG_FONT * 1.22;
  return size;
}

// How far a box's outline sits from its own label, in px. `pad` states it in
// grid units and, like the container's, is measured in uh on both axes –
// otherwise the same word would mean two distances depending on which
// statement it sat on. Without it the default stays the asymmetric px pair,
// because 13/9 is typographic taste rather than a point on the grid.
export function dgPadPx(pad, uh) {
  return pad != null ? [pad * uh, pad * uh] : [DG_PAD_X, DG_PAD_Y];
}

// The size an element's label is actually set at.
//
// Normally that is the class-derived base size and the box grows to the
// text. `.fit` reads the other way round – the box is given, and the type
// takes the size that fills it – and `.shrink` is the same solve clamped so
// it only ever scales down. dgMeasure is linear in the font size, so this is
// a ratio rather than a search.
//
// Be honest about the error term: text width here is *estimated* from a
// per-character table, tuned deliberately generous, and auto-fit compounds
// that. The chosen size runs slightly small. That is the safe direction –
// small still fits – and it is the price of having no browser at build time.
export function dgFitFont(label, classes, boxW, boxH, padX, padY) {
  const base = dgFontFor(classes);
  if (!classes.has('fit') && !classes.has('shrink')) return base;
  const m = dgMeasure(label, base, classes.has('mono'));
  if (!(m.w > 0) || !(m.h > 0)) return base;
  const ratios = [];
  if (boxW > 0) ratios.push(Math.max(0, boxW - 2 * padX) / m.w);
  if (boxH > 0) ratios.push(Math.max(0, boxH - 2 * padY) / m.h);
  if (!ratios.length) return base;
  let k = Math.min(...ratios);
  if (classes.has('shrink')) k = Math.min(1, k);
  // Clamped so a long label cannot become unreadable and a short one cannot
  // become a poster.
  k = Math.max(0.6, Math.min(1.5, k));
  return base * k;
}

// Whether an element paints a fill behind itself. A box does by default –
// its ground is the paper – and a free `text` does not, so one mechanism
// covers both: a text draws its measured label box only when the author
// gives it a fill, and `.clear` is how a box opts out. That is exactly how
// the two already look, so nothing existing changes.
//
// `.paper` counts as a fill here even though it is a box's default, because
// on a text it is the whole point: a ground in the canvas colour is what
// knocks out a line running behind a label. Leaving it out of this list was
// a hole – the class resolved, the CSS was emitted, and no rect was drawn
// for it to colour.
export const DG_FILL_CLASSES = ['tone-1', 'tone-2', 'tone-3', 'tone-4', 'paper'];
export function dgHasFill(classes) {
  return DG_FILL_CLASSES.some(c => classes.has(c));
}

// ── diagram source parsing ──────────────────────────────────────────
// Line-oriented on purpose. Every statement fits on one line, every
// reference is by name, and nothing is addressed by position – so a line
// can be inserted, reordered or rewritten without touching any other, and
// an editor writing back into the source only ever rewrites the tokens it
// changed.

// `base` is the offset of this line inside the block body, so every token
// carries `[s, e)` – where it sits in the *source*, not just what it says.
// That is the whole of phase 2 of the editor: an edit is then "replace this
// span with that text", the smallest rewrite that answers a drag, and the
// relation the author wrote survives it. Carried through rather than added
// as a second pass, because this loop already walks the line character by
// character and a second walk is a second thing to get wrong.
//
// The spans cover the token *as written*: a quoted label includes its quotes
// and an attribute tail includes its braces, so replacing the span with new
// text of the same shape is always legal.
export function dgTokenize(line, base = 0) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let j = i + 1, buf = '';
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < line.length) {
          const nxt = line[j + 1];
          buf += nxt === 'n' ? '\n' : nxt;
          j += 2;
          continue;
        }
        buf += line[j++];
      }
      out.push({ q: true, v: buf, s: base + i, e: base + Math.min(j + 1, line.length) });
      i = j + 1;
      continue;
    }
    if (ch === '{') {
      const end = line.indexOf('}', i);
      if (end < 0) { out.push({ v: line.slice(i), s: base + i, e: base + line.length }); break; }
      out.push({ attr: true, v: line.slice(i + 1, end), s: base + i, e: base + end + 1 });
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < line.length && !/[\s"{]/.test(line[j])) j++;
    out.push({ v: line.slice(i, j), s: base + i, e: base + j });
    i = j;
  }
  return out;
}

// Three sigils, three questions: # is identity, . is appearance, @ is
// membership. Tags replace the earlier `group` statement, and the reason is
// locality: adding an element to a group meant editing a `group` line
// somewhere else in the file. A tag is a token on the element's own line, so
// the edit is local, the order of declarations stops mattering, and one
// element can belong to as many sets as it likes.
export function dgParseAttrs(raw, errors, lineNo) {
  const out = { id: null, classes: [], tags: [] };
  for (const tok of String(raw).trim().split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('#')) out.id = tok.slice(1);
    else if (tok.startsWith('@')) {
      const tag = tok.slice(1);
      if (!tag) dgErr(errors, lineNo, 'an empty @tag means nothing');
      else out.tags.push(tag);
    }
    else if (tok.startsWith('.')) {
      const cls = tok.slice(1);
      if (!DG_CLASSES.has(cls)) {
        dgErr(errors, lineNo, `unknown class .${cls} (known: ${[...DG_CLASSES].join(', ')})`);
      } else out.classes.push(cls);
    } else dgErr(errors, lineNo, `attribute "${tok}" is not #id, .class or @tag`);
  }
  return out;
}

export function dgNum(tok, errors, lineNo, what) {
  const n = Number(tok);
  if (!Number.isFinite(n)) { dgErr(errors, lineNo, `${what} expects a number, got "${tok}"`); return 0; }
  return n;
}

// `mix`, `mix.right`. An unknown anchor is an error rather than a silent
// fallback to centre, because a diagram whose arrows all quietly meet in
// the middle of a box is exactly the failure that looks like a layout bug.
// `mix`, `mix.right`, `mix.right:0.3`. The fraction slides the attachment
// point along that edge, and it is what keeps two arrows between the same
// pair of boxes from collapsing into a lens: give them 0.3 and 0.7 and they
// are two parallel arrows instead of two bows over the same chord.
export function dgParseRef(tok, errors, lineNo) {
  // `edge 2,1 -> mix` – an endpoint in empty space, for an arrow that comes
  // in from outside the picture. Deliberately a literal rather than an
  // invisible anchor element: there is nothing to delete by accident, and a
  // graphical editor dragging that end rewrites two numbers on this line
  // instead of moving an object nobody can see.
  if (tok.includes(',')) {
    return { ref: null, point: dgParsePair(tok, errors, lineNo, 'an edge endpoint'), anchor: null, frac: 0.5 };
  }
  const dot = tok.indexOf('.');
  if (dot < 0) return { ref: tok, anchor: null, frac: 0.5 };
  const ref = tok.slice(0, dot);
  let anchor = tok.slice(dot + 1);
  let frac = 0.5;
  const colon = anchor.indexOf(':');
  if (colon >= 0) {
    const raw = anchor.slice(colon + 1);
    anchor = anchor.slice(0, colon);
    const f = Number(raw);
    if (!Number.isFinite(f) || f < 0 || f > 1) {
      dgErr(errors, lineNo, `anchor fraction on "${ref}.${anchor}" must be between 0 and 1, got "${raw}"`);
    } else if (!['left', 'right', 'top', 'bottom'].includes(anchor)) {
      dgErr(errors, lineNo, `a fraction only means something on .left/.right/.top/.bottom, not on .${anchor}`);
    } else frac = f;
  }
  if (!DG_ANCHORS.has(anchor)) {
    dgErr(errors, lineNo, `unknown anchor .${anchor} on "${ref}" (known: ${[...DG_ANCHORS].join(', ')})`);
    return { ref, anchor: null, frac };
  }
  return { ref, anchor, frac };
}

// Placement. Absolute is `at X,Y` in grid cells; everything else states a
// relation to a named element. Relative is the intended common form – it
// is what survives an edit elsewhere in the diagram, and it is the form a
// language model gets right, because "below the mix" is a judgement it can
// make and "does 3,2 collide with 3.4,1.8" is not.
export function dgParsePlacement(toks, k, errors, lineNo) {
  const t = (n) => (toks[n] ? toks[n].v : '');
  let place = null, next = k;

  if (t(k) === 'at') {
    // The same coordinate grammar as a waypoint or an edge endpoint, so
    // `at c1.cx,m0.cy` works and means what it says. One grammar for every
    // slot that holds a coordinate is worth more than the handful of lines
    // it costs: the alternative is a rule the author has to remember about
    // which slots are special.
    place = { kind: 'abs', at: dgParsePair(t(k + 1), errors, lineNo, 'at') };
    next = k + 2;
  } else if (t(k) === 'between') {
    // `between a,b` is the position PIC spells "1/2 way between A and B",
    // and it is what a separator glyph, a bracket label or a note beside a
    // connector actually wants. Chaining `right of` through a spacer works
    // but states the wrong thing: it says "after A" when the author means
    // "between A and B", and it comes apart the moment either box resizes.
    // Every token that can follow the member list, or one of them is read
    // as a member name: `between a,b pad 0.3` on a text used to parse `pad`
    // and `0.3` as two more elements and then complain that `0.3` is not
    // an anchor. The list is the placement's own options plus every
    // trailing option the element statements accept.
    const STOP = new Set(['frac', 'offset', 'w', 'h', 'r', 'pad', 'same', '->']);
    let mEnd = k + 1;
    while (mEnd < toks.length && !STOP.has(toks[mEnd].v)) mEnd++;
    const refs = toks.slice(k + 1, mEnd).map(x => x.v).join(',')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(r => dgParseRef(r, errors, lineNo));
    if (refs.length !== 2) {
      dgErr(errors, lineNo, `between expects exactly two elements, got ${refs.length}`);
      return [null, mEnd];
    }
    place = { kind: 'between', refs, frac: 0.5 };
    next = mEnd;
  } else {
    let dir = null;
    if (t(k) === 'right' && t(k + 1) === 'of') { dir = 'right'; next = k + 2; }
    else if (t(k) === 'left' && t(k + 1) === 'of') { dir = 'left'; next = k + 2; }
    else if (t(k) === 'below') { dir = 'below'; next = k + 1; }
    else if (t(k) === 'above') { dir = 'above'; next = k + 1; }
    if (!dir) return [null, k];
    const ref = t(next);
    if (!ref) { dgErr(errors, lineNo, `${dir} expects an element name`); return [null, next]; }
    next++;
    place = { kind: 'rel', dir, ref, gap: 0.25, align: 'center' };
  }

  // Trailing options, shared by every placement form. `offset` in
  // particular is orthogonal on purpose: any position can be nudged
  // without inventing a spacer element to hang it off.
  while (next < toks.length) {
    const key = t(next);
    if (key === 'gap' && place.kind === 'rel') {
      place.gap = dgNum(t(next + 1), errors, lineNo, 'gap'); next += 2; continue;
    }
    if (key === 'align' && place.kind === 'rel') {
      const a = t(next + 1);
      const ok = place.dir === 'right' || place.dir === 'left'
        ? ['top', 'middle', 'bottom'] : ['left', 'center', 'right'];
      if (!ok.includes(a)) dgErr(errors, lineNo, `align ${a} is not one of ${ok.join('/')} for "${place.dir}"`);
      else place.align = a;
      next += 2;
      continue;
    }
    if (key === 'frac' && place.kind === 'between') {
      const f = dgNum(t(next + 1), errors, lineNo, 'frac');
      if (f < 0 || f > 1) dgErr(errors, lineNo, `frac must be between 0 and 1, got ${f}`);
      else place.frac = f;
      next += 2;
      continue;
    }
    if (key === 'offset') {
      const parts = t(next + 1).split(',');
      if (parts.length !== 2) { dgErr(errors, lineNo, `offset expects dx,dy – got "${t(next + 1)}"`); }
      else place.offset = [dgNum(parts[0], errors, lineNo, 'offset dx'), dgNum(parts[1], errors, lineNo, 'offset dy')];
      next += 2;
      continue;
    }
    break;
  }
  // Where the placement expression sits in the source. The editor needs the
  // *end* of it: `gap`, `align`, `offset` and `frac` are options of this
  // expression, and appending one to the end of the line puts it after
  // `w`/`same as`, where the parser no longer reads it as part of the
  // placement. Recorded here because this is the only code that knows how
  // far the expression ran.
  if (place && toks[k] && toks[next - 1]) {
    place.span = [toks[k].s, toks[next - 1].e];
  }
  return [place, next];
}

// One component of a coordinate pair: a number in grid units, or an
// element's coordinate with an optional signed nudge, also in grid units.
//
//   1.12        x0.cy        iv.left        mix.cx+0.2        d1.top-0.4
//
// The nudge is not decoration. It is what lets a graphical editor record a
// drag *without* converting the reference back into an absolute number: it
// rewrites one signed scalar in place and the relation survives. Everything
// else about the grammar follows from that – one optional term, no other
// operators, no nesting, so the token an editor has to replace is always
// exactly one.
export function dgParseCoord(tok, axis, errors, lineNo, what) {
  const raw = String(tok ?? '');
  const m = raw.match(/^([A-Za-z_][\w-]*)\.([a-z]+)([+-][\d.]+)?$/);
  if (!m) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      dgErr(errors, lineNo, `${what} expects a number or an element coordinate like "x0.cy", got "${raw}"`);
      return { unit: 0 };
    }
    return { unit: n };
  }
  const [, ref, prop, nudge] = m;
  const ok = axis === 'x' ? DG_SCALAR_X : DG_SCALAR_Y;
  if (!ok.has(prop)) {
    const other = axis === 'x' ? DG_SCALAR_Y : DG_SCALAR_X;
    dgErr(errors, lineNo, other.has(prop)
      ? `${what}: ".${prop}" is a ${axis === 'x' ? 'y' : 'x'} coordinate, and this slot is the ${axis}. Use ${[...ok].map(p => '.' + p).join(' / ')}.`
      : `${what}: unknown coordinate ".${prop}" – use ${[...ok].map(p => '.' + p).join(' / ')}`);
    return { unit: 0 };
  }
  return { ref, prop, nudge: nudge ? Number(nudge) : 0 };
}

// `X,Y` where either side may be a reference.
export function dgParsePair(tok, errors, lineNo, what) {
  const parts = String(tok ?? '').split(',');
  if (parts.length !== 2) {
    dgErr(errors, lineNo, `${what} expects X,Y – got "${tok}"`);
    return null;
  }
  return [
    dgParseCoord(parts[0], 'x', errors, lineNo, what),
    dgParseCoord(parts[1], 'y', errors, lineNo, what),
  ];
}

// Resolved against the finished layout, so a reference costs no dependency
// edge: every box is already placed by the time edges are drawn.
export function dgCoordPx(c, axis, boxes, uw, uh) {
  const u = axis === 'x' ? uw : uh;
  if (c.unit !== undefined) return c.unit * u;
  const b = boxes.get(c.ref);
  if (!b) return 0;
  const v = c.prop === 'cx' ? b.x + b.w / 2
    : c.prop === 'left' ? b.x
    : c.prop === 'right' ? b.x + b.w
    : c.prop === 'cy' ? b.y + b.h / 2
    : c.prop === 'top' ? b.y
    : b.y + b.h;
  return v + c.nudge * u;
}
export const dgPairPx = (p, boxes, uw, uh) =>
  [dgCoordPx(p[0], 'x', boxes, uw, uh), dgCoordPx(p[1], 'y', boxes, uw, uh)];
export const dgPairRefs = (p) => (p || []).filter(c => c && c.ref).map(c => c.ref);

export function dgParseMembers(tok) {
  return String(tok).split(',').map(s => s.trim()).filter(Boolean);
}

// Every `default` layer that applies to one element, weakest first:
//
//   1. the lecture's  default <kind>
//   2. the lecture's  default <kind> @tag
//   3. the block's    default <kind>
//   4. the block's    default <kind> @tag
//
// Scope before selector, because "closer to the element wins" is the model
// everywhere else here: a block that says `default box {.tone-4}` means it,
// even for an element the lecture tags @dec. The element's own attributes
// are a fifth layer and are applied by the callers, which is where the
// difference between classes (slot displacement) and geometry (first
// non-null) lives.
export function dgDefaultLayers(model, kind, tags) {
  const out = [];
  const has = (t) => (tags || []).includes(t);
  if (model.baseDefaults && model.baseDefaults[kind]) out.push(model.baseDefaults[kind]);
  for (const d of (model.baseTagDefaults || [])) if (d.kind === kind && has(d.tag)) out.push(d);
  if (model.defaults[kind]) out.push(model.defaults[kind]);
  for (const d of model.tagDefaults) if (d.kind === kind && has(d.tag)) out.push(d);
  return out;
}

// One `default …` statement, read into whichever layer is collecting them.
// Factored out because the same statement is now legal in two places: inside
// a block, and in the lecture's `diagram-defaults` frontmatter key. Two
// parsers for one line is how the two would eventually disagree.
export function dgReadDefault(body0, attrs, lineNo, errors, layer, scope, span) {
  const kind = body0[1] ? body0[1].v : '';
  if (!DG_DEFAULT_KINDS.has(kind)) {
    dgErr(errors, lineNo, `default expects one of ${[...DG_DEFAULT_KINDS].join(', ')}, got "${kind}"`);
    return null;
  }
  // `default box @dec w 0.48` refines the kind default for the elements
  // carrying that tag. One per (kind, tag) and one per bare kind, so the
  // result never depends on the order of the declarations: an element's
  // own attributes beat its tag default, which beats the kind default.
  const tagTok = body0[2] && body0[2].v.startsWith('@') ? body0[2].v.slice(1) : null;
  const slot = tagTok
    ? layer.tagDefaults.find(d => d.kind === kind && d.tag === tagTok)
    : layer.defaults[kind];
  if (slot) {
    dgErr(errors, lineNo, `a second "default ${kind}${tagTok ? ' @' + tagTok : ''}" – there can only be one per ${scope} (the first is on line ${slot.line})`);
    return null;
  }
  const def = { kind, tag: tagTok, classes: attrs.classes, w: null, h: null, r: null, pad: null, side: null, line: lineNo, span };
  const opts = DG_KIND_OPTS[kind];
  const rest = body0.slice(tagTok ? 3 : 2);
  for (let k = 0; k < rest.length; k++) {
    const key = rest[k].v;
    if (kind === 'brace' && DG_BRACE_SIDES.includes(key)) { def.side = key; continue; }
    if (opts.includes(key)) { def[key] = dgNum(rest[k + 1]?.v, errors, lineNo, key); k++; continue; }
    // A wrong-kind option is the interesting case: say which kind it
    // belongs to rather than repeating the list.
    const owner = Object.keys(DG_KIND_OPTS).find(kk => DG_KIND_OPTS[kk].includes(key));
    if (owner) {
      dgErr(errors, lineNo, `default ${kind} has no "${key}" – that is a ${owner} option. `
        + `default ${kind} takes ${opts.length ? opts.join(', ') + ' and ' : ''}a {…} attribute tail.`);
      k++;   // its value, or the next word is reported as a second mistake
    } else {
      dgErr(errors, lineNo, `unexpected "${key}" in default ${kind}`);
    }
  }
  if (tagTok) layer.tagDefaults.push(def);
  else layer.defaults[kind] = def;
  return def;
}

// The lecture-wide layer: the `diagram-defaults:` frontmatter key, written
// in the same language as the block's own `default` lines. Parsed once per
// build and handed to every diagram as the base under its own defaults, so
// "make these figures match" is one edit rather than twelve.
//
// Validated even when no diagram uses it: anything but a `default` statement
// in there is an error naming the line, because a block that quietly does
// nothing is the failure mode this grammar keeps closing.
export function parseDiagramDefaults(text) {
  const errors = [];
  const layer = { defaults: {}, tagDefaults: [] };
  const lines = String(text ?? '').split('\n');
  for (let n = 0; n < lines.length; n++) {
    const trimmed = lines[n].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const toks = dgTokenize(trimmed);
    const attrTok = toks.find(x => x.attr);
    const attrs = attrTok ? dgParseAttrs(attrTok.v, errors, n + 1) : { id: null, classes: [], tags: [] };
    const body0 = toks.filter(x => !x.attr && !x.q);
    if ((body0[0] ? body0[0].v : '') !== 'default') {
      dgErr(errors, n + 1, `diagram-defaults holds "default …" statements only, got "${trimmed}"`);
      continue;
    }
    dgReadDefault(body0, attrs, n + 1, errors, layer, 'lecture');
  }
  return { layer, errors };
}

// ── diagram layout ──────────────────────────────────────────────────
// One evaluation per step. Everything downstream of a moved element is
// recomputed rather than transformed, which is the whole reason an arrow
// between two boxes stays attached when one of them walks off: the arrow
// never stored a coordinate, it stored "the right edge of mix".

export function dgAnchorPt(b, a, f = 0.5) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  switch (a) {
    case 'left': return [b.x, b.y + f * b.h];
    case 'right': return [b.x + b.w, b.y + f * b.h];
    case 'top': return [b.x + f * b.w, b.y];
    case 'bottom': return [b.x + f * b.w, b.y + b.h];
    case 'tl': return [b.x, b.y];
    case 'tr': return [b.x + b.w, b.y];
    case 'bl': return [b.x, b.y + b.h];
    case 'br': return [b.x + b.w, b.y + b.h];
    default: return [cx, cy];
  }
}

export function dgAutoAnchor(from, toward) {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  const dx = toward[0] - cx, dy = toward[1] - cy;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

export function dgUnion(boxes) {
  const x0 = Math.min(...boxes.map(b => b.x));
  const y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(b => b.x + b.w));
  const y1 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Effective per-element state after applying steps 0..k. Steps are a
// cumulative script over a copy, never a mutation of the model, so the
// same model can be evaluated for every step independently.
export function dgStateAt(model, k) {
  const expand = (id) => (id.startsWith('@') ? (model.tags.get(id.slice(1)) || []) : [id]);
  // Expanded, not raw: a `show @creation` has to mark the *elements* as
  // starting hidden. Collecting the tag string here left every one of them
  // visible from the opening beat, with the step then showing what was
  // already on screen.
  // An element starts hidden only when the *first* thing any step says about
  // it is `show`. Treating every show target as initially hidden broke the
  // hide-then-show shape: an element meant to be on screen from the opening
  // beat and taken away later started invisible instead.
  const firstMention = new Map();
  for (const s of model.steps) {
    for (const op of s.ops) {
      if (op.op !== 'show' && op.op !== 'hide') continue;
      for (const t of op.targets.flatMap(expand)) {
        if (!firstMention.has(t)) firstMention.set(t, op.op);
      }
    }
  }
  const shownLater = new Set([...firstMention].filter(([, op]) => op === 'show').map(([id]) => id));
  // The default block is the base, the element's own {…} is added on top.
  // Merged here rather than at parse time so a default declared anywhere in
  // the body still reaches every element of its kind.
  // Three layers, most specific last: the kind default, then the default
  // for a tag the element carries, then its own {…}. Each layer's classes
  // are dropped where a more specific layer already fills that slot.
  const withDefaults = (el) => {
    const layers = dgDefaultLayers(model, el.kind, el.tags);
    if (!layers.length) return new Set(el.classes);
    const acc = [];
    const claimed = new Set();
    // Walk most-specific first so a later (weaker) layer cannot displace it.
    for (const cls of [...el.classes, ...layers.reverse().flatMap(l => l.classes)]) {
      const group = DG_CLASS_GROUPS.find(g => g.includes(cls));
      if (group) {
        const key = group[0];
        if (claimed.has(key)) continue;
        claimed.add(key);
      }
      acc.push(cls);
    }
    return new Set(acc);
  };
  const state = new Map();
  const all = [...model.nodes, ...model.containers, ...model.braces];
  for (const el of all) {
    state.set(el.id, {
      visible: !shownLater.has(el.id),
      classes: withDefaults(el),
      label: el.label,
      place: el.place || null,
      shift: [0, 0],
    });
  }
  for (const e of model.edges) {
    state.set(e.id, { visible: !shownLater.has(e.id), classes: withDefaults(e), label: e.label, place: null, shift: [0, 0] });
  }
  for (let i = 0; i < k; i++) {
    for (const op of model.steps[i].ops) {
      const targets = (op.targets || (op.target ? [op.target] : [])).flatMap(expand);
      for (const id of targets) {
        const st = state.get(id);
        if (!st) continue;
        if (op.op === 'show') st.visible = true;
        else if (op.op === 'hide') st.visible = false;
        else if (op.op === 'emph') { st.classes.delete('dim'); st.classes.add('emph'); }
        else if (op.op === 'calm') { st.classes.delete('emph'); st.classes.add('dim'); }
        // Same slot rule as the default block: a class added by `style`
        // displaces the one already occupying its slot. Adding it alongside
        // left `tone-4 tone-1` on the element, both rules matching at equal
        // specificity, so stylesheet order decided the colour and the step
        // could silently do nothing.
        else if (op.op === 'style') for (const c of op.classes) {
          const group = DG_CLASS_GROUPS.find(g => g.includes(c));
          if (group) for (const other of group) st.classes.delete(other);
          st.classes.add(c);
        }
        else if (op.op === 'label') st.label = op.text;
        else if (op.op === 'move') {
          if (op.by) { st.shift = [st.shift[0] + op.by[0], st.shift[1] + op.by[1]]; }
          else if (op.to) { st.place = op.to; st.shift = [0, 0]; }
        }
      }
    }
  }
  return state;
}

// ── diagram drawables ───────────────────────────────────────────────
// Every semantic element reduces to one or two drawables, and a drawable
// is only ever a rect, a circle, a path or a block of text carrying a
// vector of numbers. That is the whole contract the runtime has to know:
// interpolate the vectors, set the attributes. It is also why an arrowhead
// is a computed filled path here rather than an SVG <marker> – a marker
// would not rotate with a moving endpoint, and its fill would have to
// resolve through context-stroke to follow the theme.

export function dgPolyPoint(pts, frac) {
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
    const len = Math.hypot(dx, dy);
    segs.push({ a: pts[i - 1], b: pts[i], len, dx, dy });
    total += len;
  }
  if (!total) return { p: pts[0], dir: [1, 0] };
  let want = total * frac;
  for (const s of segs) {
    if (want <= s.len || s === segs[segs.length - 1]) {
      const t = s.len ? want / s.len : 0;
      return { p: [s.a[0] + s.dx * t, s.a[1] + s.dy * t], dir: [s.dx / (s.len || 1), s.dy / (s.len || 1)] };
    }
    want -= s.len;
  }
  return { p: pts[pts.length - 1], dir: [1, 0] };
}

export function dgLabelVariants(model) {
  const index = new Map();
  const add = (id, text) => {
    if (!index.has(id)) index.set(id, []);
    const arr = index.get(id);
    if (!arr.includes(text)) arr.push(text);
  };
  for (const el of [...model.nodes, ...model.containers, ...model.braces, ...model.edges]) {
    if (el.label) add(el.id, el.label);
  }
  const expand = (id) => (String(id).startsWith('@')
    ? (model.tags.get(String(id).slice(1)) || []) : [id]);
  for (const s of model.steps) {
    for (const op of s.ops) {
      // Tags expand here too, or `label @tag "…"` would index the tag itself
      // and pre-render no variant for any of the elements carrying it.
      if (op.op === 'label' && op.text) for (const t of expand(op.target)) add(t, op.text);
    }
  }
  return index;
}

export function dgPathD(nums) {
  let d = '';
  for (let i = 0; i < nums.length; i += 2) {
    d += (i ? 'L' : 'M') + nums[i].toFixed(2) + ' ' + nums[i + 1].toFixed(2);
  }
  return d;
}

// Compile one ::: diagram block into an inline <svg> plus, when it has
// steps, the per-step geometry the live runtime tweens between.


// ── source spans ────────────────────────────────────────────────────
// Given a compiled model and the block body it came from, answer one
// question: **which characters do I replace to change this?**
//
// That is the whole interface between the editor's gestures and the source.
// A drag decides that `gap` should be 0.62 instead of 0.55; `spanOf(id,
// 'gap')` says where 0.55 is written, and the edit is a splice. Nothing else
// in the source moves, so the relation the author wrote – `right of reg` –
// survives a gesture that in a coordinate-based tool would have replaced it
// with two numbers.
//
// The result is uniform whether or not the attribute is there yet:
//
//   { start, end, prefix, suffix, present, text }
//
// and applying it is always the same splice:
//
//   body.slice(0, start) + prefix + value + suffix + body.slice(end)
//
// For an attribute that is present, `prefix` and `suffix` are empty and
// [start, end) is the token. For one that is absent, start === end is where
// it should go and `prefix` carries the keyword. One shape, no branch at the
// call site – which matters, because the call site is a drag handler and
// every branch there is a place for the two cases to drift apart.

const DG_KEYED_ATTRS = ['gap', 'frac', 'w', 'h', 'r', 'pad', 'align'];

// The x and y halves of a `dx,dy` token, and the signed nudge inside a
// coordinate component. Sub-token arithmetic on the token's own text, because
// a coordinate is one token by construction: `mix.cx+0.2` has no spaces in
// it, which is exactly what makes it replaceable in one splice.
function dgSplitPair(tok) {
  const comma = tok.v.indexOf(',');
  if (comma < 0) return null;
  return {
    x: { start: tok.s, end: tok.s + comma, text: tok.v.slice(0, comma) },
    y: { start: tok.s + comma + 1, end: tok.e, text: tok.v.slice(comma + 1) },
  };
}

// The `+0.2` in `mix.cx+0.2`, or the empty slot after `mix.cx` where one
// would go. Null when the component is a bare number – there is no relation
// to preserve there, so the editor rewrites the number itself.
function dgNudgeSlot(part) {
  const m = String(part.text).match(/^([A-Za-z_][\w-]*\.[a-z]+)([+-][\d.]+)?$/);
  if (!m) return null;
  if (m[2]) {
    return { start: part.end - m[2].length, end: part.end, prefix: '', suffix: '',
             present: true, text: m[2], value: m[2] };
  }
  const at = part.start + m[1].length;
  return { start: at, end: at, prefix: '', suffix: '', present: false, text: '', value: '' };
}

export function createSpanTable(model, body) {
  const src = String(body);
  const byId = new Map();
  for (const el of [...model.nodes, ...model.edges, ...model.containers, ...model.braces]) {
    // A leader stub is deliberately absent. It carries the span of the `text`
    // statement that produced it, so handing that span out under the stub's
    // name is how an editor comes to rewrite a different element: `label`
    // resolves to the text node's label, and the literal `->` on that line
    // makes `from` resolve to whatever token happens to precede it – on
    // `text n "…" right of x gap 0.85 -> x` that is the gap. Nothing about a
    // leader is editable through the stub; it is an aspect of the statement
    // that owns it, and spanOf says so by returning null.
    if (el.lead) continue;
    byId.set(el.id, el);
  }

  const toksOf = (el) => {
    if (!el || !el.span) return [];
    return dgTokenize(src.slice(el.span[0], el.span[1]), el.span[0]);
  };

  // Where a new trailing option goes. Before the attribute tail when there is
  // one – appending after it is legal, since the tail is lifted out wherever
  // it sits, but `box a "x" below b {.tone-1} gap 0.6` reads like a mistake
  // and the author has to live in this file.
  const tailInsert = (el, toks) => {
    const attr = toks.find(x => x.attr);
    if (!attr) return el.span[1];
    // Just after the last non-space character before the tail, so the new
    // option lands with one space either side however the author spaced the
    // line. Assuming exactly one space ate a quote on a line written
    // "label"{.cls} with no gap.
    let at = attr.s;
    while (at > el.span[0] && /\s/.test(src[at - 1])) at--;
    return at;
  };

  // `gap`, `align`, `frac` and `offset` are options of the *placement
  // expression*, not of the statement, so they have to go where that
  // expression ends. Appending them to the end of the line puts them after
  // `w 0.62` or `same as uaf`, and the parser stops reading placement
  // options the moment it leaves the expression – the line then fails to
  // build. Anything else (`w`, `h`, `r`, `pad`, `same as`) the statement
  // accepts anywhere, so it goes before the attribute tail where it reads
  // best.
  const PLACEMENT_OPTS = new Set(['gap', 'align', 'frac', 'offset']);
  const optionInsert = (el, toks, attr) => {
    if (!PLACEMENT_OPTS.has(attr)) return tailInsert(el, toks);
    // No span means the placement is the implicit origin the first element
    // gets for free. There is nothing in the source to hang an option off,
    // so the caller has to write the placement itself first – spanOf returns
    // null and the editor asks for 'place'.
    return el.place && el.place.span ? el.place.span[1] : null;
  };

  // `text` is always the raw source of the span, so applySpan(sp, sp.text)
  // is the identity – which is the property the round-trip check asserts and
  // the one an editor leans on when it rewrites a token it did not change.
  // `value` is what the token *means*, which for a quoted label is the
  // decoded string and for an attribute tail is what is between the braces.
  // Conflating the two is how a label round-trips without its quotes.
  const hit = (start, end, value) =>
    ({ start, end, prefix: '', suffix: '', present: true, text: src.slice(start, end), value });
  const gap = (at, prefix, suffix = '') =>
    ({ start: at, end: at, prefix, suffix, present: false, text: '', value: '' });

  function spanOf(id, attr) {
    const el = byId.get(id);
    if (!el || !el.span) return null;
    const toks = toksOf(el);
    const find = (word) => toks.findIndex(x => !x.q && !x.attr && x.v === word);

    if (attr === 'line') return hit(el.span[0], el.span[1], src.slice(el.span[0], el.span[1]));

    if (attr === 'label') {
      const q = toks.find(x => x.q);
      if (q) return hit(q.s, q.e, q.v);
      // A label goes straight after the element's name, which is the second
      // token of every statement that can carry one – except an edge, whose
      // second token is already an endpoint. `edge a "x" -> b` parses, because
      // the endpoints are read off the tokens that are neither quoted nor an
      // attribute tail, but it is not what anyone writes by hand. So an edge
      // label goes where its other trailing options go.
      const at = el.kind === 'edge' ? tailInsert(el, toks)
        : (toks[1] ? toks[1].e : el.span[1]);
      return gap(at, ' "', '"');
    }

    // The two endpoints, and the arrow between them. Two traps here, and an
    // editor that fell into either would retarget the wrong end of the line:
    // `<-` swaps what the model calls `from` and `to`, so `from` is the token
    // to the *right* of a reversed arrow; and the index has to run over the
    // body tokens the parser itself reads, never over all of them, or the
    // label in `edge a "x" -> b` is offered as the source endpoint.
    if (attr === 'from' || attr === 'to' || attr === 'arrow') {
      const body = toks.filter(x => !x.q && !x.attr);
      const i = body.findIndex(x => x.v === '->' || x.v === '<-' || x.v === '--');
      if (i < 0) return null;
      if (attr === 'arrow') return hit(body[i].s, body[i].e, body[i].v);
      const left = (attr === 'from') !== (body[i].v === '<-');
      const t = body[left ? i - 1 : i + 1];
      return t ? hit(t.s, t.e, t.v) : null;
    }

    // The three attribute-tail questions all address the tail, and that is
    // deliberate: `{#id .cls @tag}` is one token, order inside it is free,
    // and an editor adding a tag rebuilds it from the model rather than
    // splicing into the middle of it. Splitting the span three ways would
    // buy a smaller diff and cost the guarantee that the result parses.
    if (attr === 'classes' || attr === 'tags' || attr === 'id') {
      const a = toks.find(x => x.attr);
      if (a) return hit(a.s, a.e, a.v);
      return gap(el.span[1], ' {', '}');
    }

    // The whole placement expression – `at 3,2`, `right of a gap 0.6`,
    // `between a,b frac 0.3`. This is what a drag rewrites when it changes
    // the *kind* of placement, and the only way to give the first element
    // (which sits at the origin for free) a placement at all.
    if (attr === 'place') {
      const p = el.place;
      if (p && p.span) return hit(p.span[0], p.span[1], src.slice(p.span[0], p.span[1]));
      return gap(tailInsert(el, toks), ' ');
    }

    if (attr === 'same-as') {
      const k = find('same');
      if (k >= 0 && toks[k + 2]) return hit(toks[k + 2].s, toks[k + 2].e, toks[k + 2].v);
      return gap(tailInsert(el, toks), ' same as ');
    }

    if (DG_KEYED_ATTRS.includes(attr)) {
      const k = find(attr);
      if (k >= 0 && toks[k + 1]) return hit(toks[k + 1].s, toks[k + 1].e, toks[k + 1].v);
      const at = optionInsert(el, toks, attr);
      return at == null ? null : gap(at, ` ${attr} `);
    }

    if (attr === 'offset' || attr === 'offset.x' || attr === 'offset.y') {
      const k = find('offset');
      if (k >= 0 && toks[k + 1]) {
        const t = toks[k + 1];
        if (attr === 'offset') return hit(t.s, t.e, t.v);
        const parts = dgSplitPair(t);
        if (!parts) return hit(t.s, t.e, t.v);
        const half = attr === 'offset.x' ? parts.x : parts.y;
        return hit(half.start, half.end, half.text);
      }
      const at = optionInsert(el, toks, 'offset');
      if (at == null) return null;
      if (attr === 'offset.x') return gap(at, ' offset ', ',0');
      if (attr === 'offset.y') return gap(at, ' offset 0,');
      return gap(at, ' offset ');
    }

    // Waypoints, addressed by index: `via.2`, `via.2.x`, `via.2.y` and the two
    // nudge slots. Same shape as `at`, because it is the same coordinate
    // grammar – one dgParsePair behind `at`, `move … to`, waypoints and
    // endpoints, which is exactly what makes one editor gesture serve all of
    // them. `via` on its own is the whole clause, keyword included, which is
    // what inserting the first waypoint or removing the last one rewrites.
    if (attr === 'via' || attr.startsWith('via.')) {
      const body = toks.filter(x => !x.q && !x.attr);
      const vi = body.findIndex(x => x.v === 'via');
      if (attr === 'via') {
        // The caller writes the whole clause, keyword included, in both cases.
        // Letting the absent case supply `via ` in its prefix would mean the
        // same value string is right for one and doubles the keyword for the
        // other, which is the sort of asymmetry an editor discovers in front
        // of a room.
        if (vi < 0) return gap(tailInsert(el, toks), ' ');
        return hit(body[vi].s, body[body.length - 1].e,
          src.slice(body[vi].s, body[body.length - 1].e));
      }
      if (vi < 0) return null;
      const rest = attr.slice(4);
      const dot = rest.indexOf('.');
      const k = Number(dot < 0 ? rest : rest.slice(0, dot));
      const t = body[vi + 1 + k];
      if (!Number.isInteger(k) || k < 0 || !t) return null;
      const tail = dot < 0 ? '' : rest.slice(dot + 1);
      if (!tail) return hit(t.s, t.e, t.v);
      const parts = dgSplitPair(t);
      if (!parts) return null;
      const half = tail.startsWith('x') ? parts.x : parts.y;
      if (tail === 'x' || tail === 'y') return hit(half.start, half.end, half.text);
      if (tail === 'x.nudge' || tail === 'y.nudge') return dgNudgeSlot(half);
      return null;
    }

    if (attr.startsWith('at')) {
      const k = find('at');
      if (k < 0 || !toks[k + 1]) return null;
      const t = toks[k + 1];
      if (attr === 'at') return hit(t.s, t.e, t.v);
      const parts = dgSplitPair(t);
      if (!parts) return null;
      const half = attr.startsWith('at.x') ? parts.x : parts.y;
      if (attr === 'at.x' || attr === 'at.y') return hit(half.start, half.end, half.text);
      if (attr === 'at.x.nudge' || attr === 'at.y.nudge') return dgNudgeSlot(half);
      return null;
    }

    return null;
  }

  // The statement that owns a coordinate the editor cannot move directly:
  // `align y middle a, b, c` and `spread x a, …, z` are the two, and the
  // refusal in §9.3 has to name the line rather than silently breaking the
  // set. Returns the align/spread record, or null.
  function constrainedBy(id, axis) {
    for (const a of model.aligns) {
      if (a.axis === axis && a.members.indexOf(id) > 0) return { kind: 'align', ...a };
    }
    for (const s of model.spreads) {
      const k = s.members.indexOf(id);
      if (s.axis === axis && k > 0 && k < s.members.length - 1) return { kind: 'spread', ...s };
    }
    return null;
  }

  // Every statement that names an element, for the reference list a delete
  // owes the author (§9.3). Ids, not spans: what the author needs first is
  // "three lines refer to this", and the lines are what they are shown.
  function referencesTo(id) {
    const out = [];
    // `from` is the element doing the referring. The caller needs it to drop
    // the entries that are inside its own selection – without it a delete of
    // two elements reports each as a reason not to delete the other.
    const note = (line, what, from) => out.push({ line, what, from, id: from });
    for (const n of model.nodes) {
      if (n.id === id) continue;
      const p = n.place;
      const refs = p && p.kind === 'rel' ? [p.ref]
        : p && p.kind === 'between' ? p.refs.map(r => r.ref)
        : p && p.kind === 'abs' ? dgPairRefs(p.at) : [];
      if (refs.includes(id)) note(n.line, `${n.kind} ${n.id} is placed against it`, n.id);
      if (n.sameAs === id) note(n.line, `${n.kind} ${n.id} takes its size from it (same as)`, n.id);
    }
    for (const e of model.edges) {
      if (e.id === id) continue;
      if ((!e.from.point && e.from.ref === id) || (!e.to.point && e.to.ref === id)) {
        note(e.line, `edge ${e.id} ends on it`, e.id);
      }
    }
    for (const c of [...model.containers, ...model.braces]) {
      if (c.members.includes(id)) note(c.line, `${c.kind} ${c.id} holds it`, c.id);
    }
    for (const a of model.aligns) {
      if (a.members.includes(id)) note(a.line, `align ${a.axis} ${a.edge}`, null);
    }
    for (const s of model.spreads) {
      if (s.members.includes(id)) note(s.line, `spread ${s.axis}`, null);
    }
    for (const st of model.steps) {
      for (const op of st.ops) {
        const targets = op.targets || (op.target ? [op.target] : []);
        if (targets.includes(id)) note(op.line, `step ${st.name}: ${op.op}`, null);
      }
    }
    return out;
  }

  // Apply one span answer. Kept here rather than in the editor because the
  // shape of the answer and the way it is applied are one decision, and a
  // second implementation of this three-line splice is a second place for an
  // off-by-one.
  function applySpan(span, value) {
    if (!span) return src;
    return src.slice(0, span.start) + span.prefix + value + span.suffix + src.slice(span.end);
  }

  return { spanOf, applySpan, constrainedBy, referencesTo, elementIds: () => [...byId.keys()] };
}

// ── the injected leaves ─────────────────────────────────────────────
// Four things the compiler needs that it cannot do itself, because they read
// the disk or know about the page. Node passes its fs-based versions; the
// browser passes lookups into a table the build emitted beside the diagram.
//
//   resolveImage(ref)   -> {abs, href, remote} | null
//                          Node: the assets/ lookup ![](fig-id) already uses.
//                          Browser: the asset is already resolved – the
//                          compiled SVG carries the data URI – so this is a
//                          table lookup.
//   imageAspect(abs)    -> h/w or null. Same split.
//   warn(msg)           Node: console.warn('[diagram] …'). Browser: into the
//                          editor's message area, so a [diagram] warning is
//                          something the author sees rather than something
//                          buried in a console nobody has open.
//   escapeHtml(s)       the one from build.js.
//   assetMarkup(node, id, geo) -> the <svg>/<image> element for a resolved
//                          asset. This is the fifth leaf and the plan named
//                          four; it exists because splicing a vector asset
//                          inline (so it re-colours with the theme) needs
//                          inlineSvg(), which needs the file. The browser
//                          substitutes id and geometry into markup the build
//                          already emitted, which is also what makes the
//                          re-render byte-identical.
//
// Everything above this line is pure and exported directly; everything below
// closes over these.
export function createDiagramCompiler(env = {}) {
  const resolveImage = env.resolveImage || (() => null);
  const imageAspect = env.imageAspect || (() => null);
  const dgWarn = env.warn || (() => {});
  const escapeHtml = env.escapeHtml || ((s = '') => String(s));
  const assetMarkup = env.assetMarkup || (() => '');
  // The per-diagram id prefix. Held here rather than in build.js because it
  // is the compiler's own counter: two compilers in one process (the build
  // and, one day, a test) must not share it.
  let dgCounter = 0;

  function parseDiagramSource(body, headAttrs, base) {
    const errors = [];
    const model = {
      unit: DG_UNIT.slice(),
      nodes: [],       // box | dot | text
      edges: [],
      braces: [],
      containers: [],
      steps: [],
      aligns: [],
      spreads: [],
      defaults: {},
      tagDefaults: [],
      // The lecture-wide layer (`diagram-defaults` in the frontmatter), under
      // the block's own. Held separately rather than merged so the sidebar can
      // still say which layer a resolved value came from, and so a block's
      // `default box` means it – even for an element the lecture tags @dec.
      baseDefaults: (base && base.defaults) || {},
      baseTagDefaults: (base && base.tagDefaults) || [],
      byId: new Map(),
    };
    const layer = { defaults: model.defaults, tagDefaults: model.tagDefaults };
    const scopeWord = 'diagram';

    for (const tok of String(headAttrs || '').trim().split(/\s+/).filter(Boolean)) {
      const m = tok.match(/^unit=(\d+)x(\d+)$/);
      if (m) { model.unit = [Number(m[1]), Number(m[2])]; continue; }
      if (tok.startsWith('#')) { model.id = tok.slice(1); continue; }
      dgErr(errors, 0, `unknown ::: diagram option "${tok}" (expected #id or unit=WxH)`);
    }

    const claim = (id, kind, lineNo) => {
      if (!id) return;
      // A name containing a dot would be indistinguishable from `elem.cx` in a
      // coordinate, and one containing @ or # from a tag or an id token.
      if (!/^[A-Za-z_][\w-]*$/.test(id)) {
        dgErr(errors, lineNo, `"${id}" is not a usable name – letters, digits, _ and - only, starting with a letter`);
        return;
      }
      if (model.byId.has(id)) dgErr(errors, lineNo, `duplicate element id "${id}"`);
      else model.byId.set(id, kind);
    };

    const lines = String(body).split('\n');
    let step = null;
    let anonEdge = 0;

    // Where each line starts inside the block body. The tokenizer is given
    // the offset of the *trimmed* line, so every token's span points at the
    // real source and an editor can replace it in place. `span` on a
    // statement is the trimmed line itself – see createSpanTable.
    let lineAt = 0;
    for (let n = 0; n < lines.length; n++) {
      const raw = lines[n];
      const lineNo = n + 1;
      const trimmed = raw.trim();
      const indent = raw.length - raw.replace(/^\s+/, '').length;
      const span = [lineAt + indent, lineAt + indent + trimmed.length];
      lineAt += raw.length + 1;
      if (!trimmed || trimmed.startsWith('#')) continue;
      const toks = dgTokenize(trimmed, span[0]);
      const head = toks[0].v;
      const t = (i) => (toks[i] ? toks[i].v : '');
      const attrTok = toks.find(x => x.attr);
      const attrs = attrTok ? dgParseAttrs(attrTok.v, errors, lineNo) : { id: null, classes: [] };
      const quoted = toks.filter(x => x.q).map(x => x.v);
      const body0 = toks.filter(x => !x.attr && !x.q);

      // Inside a `step` block, everything indented is an operation on it.
      if (step && head !== 'step' && DG_STEP_OPS.has(head)) {
        const op = { op: head, line: lineNo, span };
        if (head === 'show' || head === 'hide' || head === 'emph' || head === 'calm') {
          op.targets = dgParseMembers(body0.slice(1).map(x => x.v).join(','));
        } else if (head === 'style') {
          op.targets = dgParseMembers(body0.slice(1).map(x => x.v).join(','));
          op.classes = attrs.classes;
        } else if (head === 'label') {
          op.target = t(1);
          op.text = quoted[0] ?? '';
        } else if (head === 'move') {
          op.target = body0[1] ? body0[1].v : '';
          const verb = body0[2] ? body0[2].v : '';
          const rest = body0.slice(3);
          if (verb === 'by') {
            const parts = (rest[0] ? rest[0].v : '').split(',');
            op.by = [dgNum(parts[0], errors, lineNo, 'move by dx'), dgNum(parts[1] ?? '0', errors, lineNo, 'move by dy')];
          } else if (verb === 'to') {
            // `move mix to 3,2` is the same thing as `at 3,2`, spelled the way
            // it reads out loud. Anything else is a relation.
            if (rest[0] && rest[0].v.includes(',') && rest[0].v !== ',') {
              op.to = { kind: 'abs', at: dgParsePair(rest[0].v, errors, lineNo, 'move … to') };
            } else {
              const [place] = dgParsePlacement(rest, 0, errors, lineNo);
              if (!place) dgErr(errors, lineNo, `move ${op.target} to … needs "X,Y" or a relation (below / above / right of / left of)`);
              op.to = place;
            }
          } else {
            dgErr(errors, lineNo, 'move expects "to" or "by" after the element name');
          }
        }
        step.ops.push(op);
        continue;
      }

      if (!DG_KEYWORDS.has(head)) {
        // `//` is what everyone reaches for first, and the generic complaint
        // does not mention comments at all.
        dgErr(errors, lineNo, trimmed.startsWith('//')
          ? 'a comment line starts with # in a diagram, not //'
          : `unknown statement "${head}" (known: ${[...DG_KEYWORDS].join(', ')}${step ? ', ' + [...DG_STEP_OPS].join(', ') : ''})`);
        continue;
      }

      // align / spread do not place an element, they take one coordinate of it
      // from somewhere else. Modelled as an extra dependency plus a coordinate
      // override in the same topological walk, so there is still no solver and
      // still no second pass: the master is laid out first by construction.
      if (head === 'align' || head === 'spread') {
        const axis = t(1);
        if (axis !== 'x' && axis !== 'y') {
          dgErr(errors, lineNo, `${head} expects an axis, x or y, got "${axis}"`);
          continue;
        }
        if (head === 'align') {
          const edge = t(2);
          const ok = axis === 'x' ? DG_ALIGN_X : DG_ALIGN_Y;
          if (!ok.has(edge)) {
            const other = axis === 'x' ? DG_ALIGN_Y : DG_ALIGN_X;
            dgErr(errors, lineNo, other.has(edge)
              ? `align x/y: "${edge}" is a ${axis === 'x' ? 'y' : 'x'} edge. On the ${axis} axis use ${[...ok].join('/')}.`
              : `align ${axis} expects ${[...ok].join('/')}, got "${edge}"`);
            continue;
          }
          const members = dgParseMembers(body0.slice(3).map(x => x.v).join(','));
          if (members.length < 2) { dgErr(errors, lineNo, `align ${axis} ${edge} needs at least two elements`); continue; }
          model.aligns.push({ edge, axis, members, line: lineNo, span });
        } else {
          const members = dgParseMembers(body0.slice(2).map(x => x.v).join(','));
          if (members.length < 3) { dgErr(errors, lineNo, `spread ${axis} needs at least three elements – the first and last stay put and the rest are distributed between them`); continue; }
          model.spreads.push({ axis, members, line: lineNo, span });
        }
        continue;
      }

      if (head === 'default') {
        dgReadDefault(body0, attrs, lineNo, errors, layer, scopeWord, span);
        continue;
      }

      if (head === 'step') {
        const name = t(1) || `step-${model.steps.length + 1}`;
        step = { name, ops: [], line: lineNo, span };
        model.steps.push(step);
        continue;
      }
      // A definition after the first step block ends step mode: definitions
      // are the picture, steps are what happens to it.
      step = null;

      if (head === 'box' || head === 'dot' || head === 'text' || head === 'image') {
        const id = t(1);
        if (!id) { dgErr(errors, lineNo, `${head} needs a name`); continue; }
        claim(id, head, lineNo);
        // `image` takes the asset reference in the slot where the others take
        // their first placement token, so the rest of the line parses the same.
        const isImage = head === 'image';
        const src = isImage ? t(2) : null;
        if (isImage && !src) dgErr(errors, lineNo, `image ${id} needs an asset (a fig-id, a path or a URL)`);
        // `s`/`e` are carried through: dgParsePlacement records where the
        // placement expression ends, and an editor inserting `gap` or
        // `offset` has to put it *there* rather than at the end of the
        // line – a placement option after `w 0.62` is not part of the
        // placement any more, and the build rejects it.
        const rest = body0.slice(isImage ? 3 : 2).map(x => ({ v: x.v, s: x.s, e: x.e }));
        let k = 0;
        const node = {
          kind: head, id, label: isImage ? '' : (quoted[0] ?? ''),
          alt: isImage ? (quoted[0] ?? '') : '',
          src, classes: attrs.classes, tags: attrs.tags, place: null,
          w: null, h: null, r: null, pad: null, line: lineNo, span,
        };
        if (isImage && src) {
          const found = resolveImage(src);
          if (!found) dgErr(errors, lineNo, `image ${id}: cannot find "${src}" – expected assets/${src}.{svg,png,jpg,…}, a path, or an https URL`);
          else { node.asset = found; node.aspect = found.abs ? imageAspect(found.abs) : null; }
        }
        while (k < rest.length) {
          const key = rest[k].v;
          // A leader line: `text n "…" right of c gap 0.7 -> leak`. This is
          // the escape from layout pressure – put the words where they read
          // best and let a stub say what they are about. It is a tail on
          // `text` rather than a keyword of its own so that any label can
          // grow one, and so the vocabulary stays at eight statements.
          if (key === '->') {
            node.leader = rest[k + 1] ? rest[k + 1].v : '';
            if (!node.leader) dgErr(errors, lineNo, `${head} ${id}: "->" needs an element to point at`);
            k += 2;
            continue;
          }
          // `same as X` copies X's width and height. Geometry only: styling
          // is what the `default` block is for, and one line covering every
          // box beats a chain of `same as` through the diagram.
          if (key === 'same') {
            if (rest[k + 1]?.v !== 'as' || !rest[k + 2]) {
              dgErr(errors, lineNo, `${head} ${id}: "same" must be written "same as <element>"`);
              k += 2;
              continue;
            }
            node.sameAs = rest[k + 2].v;
            k += 3;
            continue;
          }
          if (key === 'w') { node.w = dgNum(rest[k + 1]?.v, errors, lineNo, 'w'); k += 2; continue; }
          if (key === 'h') { node.h = dgNum(rest[k + 1]?.v, errors, lineNo, 'h'); k += 2; continue; }
          if (key === 'r') { node.r = dgNum(rest[k + 1]?.v, errors, lineNo, 'r'); k += 2; continue; }
          if (key === 'pad' && DG_KIND_OPTS[head].includes('pad')) {
            node.pad = dgNum(rest[k + 1]?.v, errors, lineNo, 'pad'); k += 2; continue;
          }
          const [place, next] = dgParsePlacement(rest, k, errors, lineNo);
          if (place) { node.place = place; k = next; continue; }
          dgErr(errors, lineNo, `unexpected "${key}" in ${head} ${id}`);
          k++;
        }
        // The first element anchors the diagram at the origin, so the common
        // case of "a box, and then everything relative to it" needs no
        // coordinates at all. Every element after it has to say where it
        // goes – silently stacking two elements on 0,0 is not a default
        // anyone means.
        if (!node.place) {
          // `implicit` because nothing in the source says it: there is no
          // span to rewrite, so an editor that wants to nudge this element
          // has to write the placement out first. spanOf says so rather
          // than handing back an insertion point that would not parse.
          if (model.nodes.length === 0) node.place = { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] };
          else dgErr(errors, lineNo, `${head} ${id} has no placement (at X,Y / below … / above … / right of … / left of … )`);
        }
        model.nodes.push(node);
        if (node.leader) {
          const leadId = `${id}--lead`;
          claim(leadId, 'edge', lineNo);
          const to = dgParseRef(node.leader, errors, lineNo);
          // Kept on the node as well: the label is only as visible as what it
          // points at, and that check should not re-parse the reference once
          // per element per step.
          node.leaderRef = to.point ? null : to.ref;
          model.edges.push({
            kind: 'edge',
            id: leadId,
            // Not a statement of its own. `span` is the *text* statement's,
            // because that is the line this stub came from, and `lead` is how
            // anything downstream knows not to treat the span as the stub's
            // own to rewrite. See createSpanTable.
            lead: true,
            from: { ref: id, anchor: null },
            to,
            label: '', classes: ['no-head', 'muted'], via: [], line: lineNo, span,
          });
        }
        continue;
      }

      if (head === 'edge') {
        const arrowAt = body0.findIndex(x => x.v === '->' || x.v === '<-' || x.v === '--');
        if (arrowAt < 0) { dgErr(errors, lineNo, `edge needs "->" between two element names`); continue; }
        const fromTok = body0[arrowAt - 1]?.v, toTok = body0[arrowAt + 1]?.v;
        if (!fromTok || !toTok) { dgErr(errors, lineNo, `edge needs an element on both sides of "->"`); continue; }
        const flip = body0[arrowAt].v === '<-';
        const id = attrs.id || `edge-${++anonEdge}`;
        claim(id, 'edge', lineNo);
        const edge = {
          kind: 'edge',
          id,
          from: dgParseRef(flip ? toTok : fromTok, errors, lineNo),
          to: dgParseRef(flip ? fromTok : toTok, errors, lineNo),
          label: quoted[0] ?? '',
          classes: attrs.classes.slice(),
          tags: attrs.tags,
          via: [], line: lineNo, span,
        };
        if (body0[arrowAt].v === '--' && !edge.classes.includes('no-head')) edge.classes.push('no-head');
        // Waypoints are introduced by `via`, once, and it is not optional: every
        // other modifier in this grammar is a keyword followed by its values,
        // and a bare `1,2` hanging off the end of an edge read like a typo even
        // to the author who wrote it.
        let seenVia = false;
        for (let k = arrowAt + 2; k < body0.length; k++) {
          if (body0[k].v === 'via') {
            if (seenVia) dgErr(errors, lineNo, `edge ${id}: one "via" carries every waypoint – "via X,Y X,Y"`);
            seenVia = true;
            continue;
          }
          if (!seenVia) {
            dgErr(errors, lineNo, body0[k].v.includes(',')
              ? `edge ${id}: a waypoint needs "via" in front of it – "via ${body0[k].v}"`
              : `unexpected "${body0[k].v}" in edge ${id} (waypoints are "via X,Y X,Y")`);
            continue;
          }
          const p = dgParsePair(body0[k].v, errors, lineNo, 'a waypoint');
          if (p) edge.via.push(p);
        }
        model.edges.push(edge);
        continue;
      }

      if (head === 'brace' || head === 'container') {
        const id = t(1);
        if (!id) { dgErr(errors, lineNo, `${head} needs a name`); continue; }
        claim(id, head, lineNo);
        const overAt = body0.findIndex(x => x.v === 'over');
        if (overAt < 0) { dgErr(errors, lineNo, `${head} ${id} needs "over a,b,c"`); continue; }
        // `over a, b, c` tokenizes into several tokens; everything up to the
        // first trailing keyword is the member list.
        const TRAIL = new Set(['pad', ...DG_BRACE_SIDES]);
        let mEnd = overAt + 1;
        while (mEnd < body0.length && !TRAIL.has(body0[mEnd].v)) mEnd++;
        const members = dgParseMembers(body0.slice(overAt + 1, mEnd).map(x => x.v).join(','));
        if (!members.length) { dgErr(errors, lineNo, `${head} ${id} lists no members`); continue; }
        const rest = body0.slice(mEnd);
        // `pad` on both, and it means the same thing on both: how far the
        // outline sits from what it encloses. The brace used to spell it
        // `gap`, which is the word for the distance between two *elements*
        // everywhere else in the grammar.
        const item = { kind: head, id, members, label: quoted[0] ?? '', classes: attrs.classes, tags: attrs.tags, pad: null, line: lineNo, span };
        if (head === 'brace') item.side = null;
        for (let k = 0; k < rest.length; k++) {
          const key = rest[k].v;
          if (head === 'brace' && DG_BRACE_SIDES.includes(key)) { item.side = key; continue; }
          if (key === 'pad') { item.pad = dgNum(rest[k + 1]?.v, errors, lineNo, 'pad'); k++; continue; }
          dgErr(errors, lineNo, `unexpected "${key}" in ${head} ${id}`);
        }
        (head === 'brace' ? model.braces : model.containers).push(item);
        continue;
      }
    }

    // Referential integrity. Every name an element points at has to exist –
    // a dangling reference is the one failure mode that would otherwise
    // render as "an arrow is mysteriously missing".
    // Every tag and who carries it. Built after parsing so a tag can be
    // referenced before the element that carries it is declared – the whole
    // point of moving membership onto the element's own line.
    model.tags = new Map();
    for (const el of [...model.nodes, ...model.containers, ...model.braces, ...model.edges]) {
      for (const tag of (el.tags || [])) {
        if (!model.tags.has(tag)) model.tags.set(tag, []);
        model.tags.get(tag).push(el.id);
      }
    }
    // A tag expands in declaration order wherever a member list is accepted.
    // Expansion happens before the reference check below, so an unknown tag
    // has to complain here or it would silently vanish into an empty list.
    const expandList = (list, lineNo, what) => list.flatMap(m => {
      if (!m.startsWith('@')) return [m];
      const hit = model.tags.get(m.slice(1));
      if (!hit || !hit.length) {
        dgErr(errors, lineNo, `${what} refers to @${m.slice(1)}, which no element carries`);
        return [];
      }
      return hit;
    });
    for (const h of model.containers) h.members = expandList(h.members, h.line, `container ${h.id}`);
    for (const h of model.braces) h.members = expandList(h.members, h.line, `brace ${h.id}`);
    for (const h of model.aligns) h.members = expandList(h.members, h.line, `align ${h.axis} ${h.edge}`);
    for (const h of model.spreads) h.members = expandList(h.members, h.line, `spread ${h.axis}`);
    for (const d of model.tagDefaults) {
      if (!model.tags.has(d.tag)) {
        dgErr(errors, d.line, `default ${d.kind} @${d.tag} – no element carries @${d.tag}`);
      }
    }
    // An element carrying two tags that both default its kind has no
    // order-independent answer, and the two halves of the resolution used to
    // disagree about it: classes took the last declared, geometry the first.
    // Refuse it rather than pick.
    for (const el of [...model.nodes, ...model.containers, ...model.braces, ...model.edges]) {
      const hits = model.tagDefaults.filter(d => d.kind === el.kind && (el.tags || []).includes(d.tag));
      if (hits.length > 1) {
        dgErr(errors, el.line, `${el.kind} ${el.id} carries @${hits.map(h => h.tag).join(' and @')}, `
          + `and both have a "default ${el.kind}" (lines ${hits.map(h => h.line).join(', ')}) – `
          + `which one wins would depend on their order, so say it on the element instead`);
      }
    }
    // Containers and braces are fitted rather than sized, so `pad` (and the
    // brace's side) never reach sizeOf's three-layer `pick`. Settle them here
    // instead, by the same rule and in the same order – own line, then a tag
    // default, then the kind default – so `default container pad 0.42` covers
    // a diagram full of containers the way `default box w 1` covers its boxes.
    for (const el of [...model.containers, ...model.braces]) {
      const layers = dgDefaultLayers(model, el.kind, el.tags).reverse();
      const layer = (key) => {
        if (el[key] != null) return el[key];
        for (const d of layers) if (d[key] != null) return d[key];
        return null;
      };
      el.pad = layer('pad') ?? DG_PAD_DEFAULT;
      if (el.kind === 'brace') el.side = layer('side') ?? 'right';
    }
    const known = (id) => (id.startsWith('@') ? model.tags.has(id.slice(1)) : model.byId.has(id));
    const checkRef = (id, lineNo, what) => {
      if (!id || known(id)) return;
      if (id.startsWith('@')) {
        dgErr(errors, lineNo, `${what} refers to @${id.slice(1)}, which no element carries`);
        return;
      }
      // The commonest slip is reaching for a class where a tag was meant, so
      // say that rather than the generic complaint.
      const bare = id.startsWith('.') ? id.slice(1) : id;
      const hint = DG_CLASSES.has(bare)
        ? ` – ".${bare}" is a class; a set you can address is written "@${bare}"` : '';
      dgErr(errors, lineNo, `${what} refers to "${id}", which is not defined${hint}`);
    };
    const refsOf = (place) => place?.kind === 'rel' ? [place.ref]
      : place?.kind === 'between' ? place.refs.map(r => r.ref)
      : place?.kind === 'abs' ? dgPairRefs(place.at) : [];
    for (const n of model.nodes) {
      for (const r of refsOf(n.place)) checkRef(r, n.line, `${n.kind} ${n.id}`);
      if (n.sameAs) checkRef(n.sameAs, n.line, `${n.kind} ${n.id} (same as)`);
    }
    for (const e of model.edges) {
      if (!e.from.point) checkRef(e.from.ref, e.line, `edge ${e.id}`);
      else for (const r of dgPairRefs(e.from.point)) checkRef(r, e.line, `edge ${e.id}`);
      if (!e.to.point) checkRef(e.to.ref, e.line, `edge ${e.id}`);
      else for (const r of dgPairRefs(e.to.point)) checkRef(r, e.line, `edge ${e.id}`);
      for (const p of e.via) for (const r of dgPairRefs(p)) checkRef(r, e.line, `edge ${e.id} waypoint`);
    }
    for (const c of [...model.containers, ...model.braces]) {
      for (const m of c.members) checkRef(m, c.line, `${c.id}`);
    }
    for (const a of [...model.aligns, ...model.spreads]) {
      const what = a.edge ? `align ${a.axis} ${a.edge}` : `spread ${a.axis}`;
      for (const m of a.members) checkRef(m, a.line, what);
    }
    for (const s of model.steps) {
      for (const op of s.ops) {
        for (const target of (op.targets || (op.target ? [op.target] : []))) checkRef(target, op.line, `step ${s.name}`);
        for (const r of refsOf(op.to)) checkRef(r, op.line, `step ${s.name}`);
        // `move @row to 3,2` gives every member of the set the same placement,
        // which stacks them on one point – never what a set-wide move means.
        // `by` is the one that translates a group, so name it.
        if (op.op === 'move' && op.to && op.target && op.target.startsWith('@')) {
          const members = model.tags.get(op.target.slice(1)) || [];
          if (members.length > 1) {
            dgErr(errors, op.line, `move ${op.target} to … would place all ${members.length} elements `
              + `carrying ${op.target} at the same point. To translate a set, use "move ${op.target} by dx,dy".`);
          }
        }
      }
    }

    return { model, errors };
  }

  function layoutDiagram(model, state, errors) {
    const [uw, uh] = model.unit;
    const boxes = new Map();   // id -> {x,y,w,h}

    // Sizes first: they depend only on the element's own label and class,
    // never on placement, so they can be settled before the DAG walk.
    const sizeOf = (node) => {
      const st = state.get(node.id);
      const classes = st.classes;
      // Geometry follows the same layers, strongest first.
      const layers = dgDefaultLayers(model, node.kind, node.tags).reverse();
      const pick = (key) => {
        if (node[key] != null) return node[key];
        for (const d of layers) if (d[key] != null) return d[key];
        return null;
      };
      const [padX, padY] = dgPadPx(pick('pad'), uh);
      // `.fit` and `same as` are ordered. sizeOf otherwise depends only on the
      // element's own label and class, which is what lets sizes settle before
      // the DAG walk – but a fitted size needs the box, and a copied box is
      // whatever X turned out to be. So the copy happens first and the fit is
      // solved against the result. That works because `same as` is already a
      // dependency edge, so X is laid out by the time we are here.
      const fitted = (w, h) => (classes.has('fit') || classes.has('shrink')
        ? dgFitFont(st.label, classes, w, h, padX, padY) : dgFontFor(classes));
      if (node.sameAs) {
        const ref = boxes.get(node.sameAs);
        if (ref) return { w: ref.w, h: ref.h, font: fitted(ref.w, ref.h), padX, padY };
      }
      const nw = pick('w');
      const nh = pick('h');
      // Something to fit *into* is the whole premise, so an element with
      // neither is a line that would otherwise quietly do nothing.
      if ((classes.has('fit') || classes.has('shrink')) && nw == null && !node.sameAs) {
        errors.push({ line: node.line, msg: `${node.kind} ${node.id}: `
          + `.${classes.has('fit') ? 'fit' : 'shrink'} sizes the type to the box, so the box has to be `
          + `given – add "w n" or "same as <element>"` });
      }
      if (node.kind === 'dot') {
        const nr = pick('r');
        const r = nr != null ? nr * uh : DG_DOT_R;
        return { w: 2 * r, h: 2 * r, font: fitted(2 * r, 2 * r), padX, padY };
      }
      if (node.kind === 'image') {
        const w = (nw != null ? nw : 1) * uw;
        if (nh != null) return { w, h: nh * uh };
        if (node.aspect) return { w, h: w * node.aspect };
        dgWarn(`image ${node.id}: cannot read the asset's proportions, assuming square – give it an explicit h.`);
        return { w, h: w };
      }
      const font = fitted(nw != null ? nw * uw : 0, nh != null ? nh * uh : 0);
      const m = dgMeasure(st.label, font, classes.has('mono'));
      // A free `text` sizes itself to its label, and an explicit w or h says
      // otherwise – which is what a `.fit` text needs, and what `w` on a text
      // meant on paper long before it did anything.
      if (node.kind === 'text') {
        return { w: nw != null ? nw * uw : m.w, h: nh != null ? nh * uh : m.h, font, padX, padY };
      }
      // An explicit w that cannot hold its own label overflows in silence –
      // right on the machine that drew it, wrong on the projector. Say so.
      // A fitted label cannot: the size was chosen to make it fit.
      if (nw != null && nw * uw < m.w + 6 && !classes.has('fit') && !classes.has('shrink')) {
        dgWarn(`box ${node.id} is ${nw} units wide but its label needs about `
          + `${((m.w + 2 * padX) / uw).toFixed(2)} – the text will overflow.`);
      }
      return {
        w: nw != null ? nw * uw : Math.max(m.w + 2 * padX, DG_MIN_W),
        h: nh != null ? nh * uh : m.h + 2 * padY,
        font, padX, padY,
      };
    };

    // Dependency graph. Nodes depend on whatever they are placed against;
    // containers, braces and groups depend on their members.
    const deps = new Map();
    const order = [];
    const kindOf = new Map();
    const placeDeps = (place) => {
      if (!place) return [];
      if (place.kind === 'rel') return [place.ref];
      if (place.kind === 'between') return place.refs.map(r => r.ref);
      // An `at` may name other elements now, and unlike an edge a node is
      // placed during the walk – so those references are real dependencies,
      // and a circular one is caught by the same cycle detector.
      if (place.kind === 'abs') return dgPairRefs(place.at);
      return [];
    };
    // The first element listed is the master; everybody else takes that one
    // coordinate from it. Being explicit about which one wins is what keeps
    // this a DAG instead of a constraint system.
    const alignX = new Map(), alignY = new Map(), spreadAt = new Map();
    const extraDeps = new Map();
    const addDep = (id, on) => {
      if (!extraDeps.has(id)) extraDeps.set(id, []);
      extraDeps.get(id).push(on);
    };
    // align and spread work by overriding a coordinate the node branch of the
    // walk computes, so naming anything else has to be an error rather than a
    // line that quietly does nothing.
    const isNode = new Set(model.nodes.map(n => n.id));
    const nodeOnly = (m, line, what) => {
      if (isNode.has(m)) return true;
      errors.push({ line, msg: `${what} names "${m}", which is not a box, dot, text or image – only those can be aligned or distributed` });
      return false;
    };
    for (const a of model.aligns) {
      if (!a.members.every(m => nodeOnly(m, a.line, `align ${a.axis} ${a.edge}`))) continue;
      const [master, ...rest] = a.members;
      const table = a.axis === 'x' ? alignX : alignY;
      for (const m of rest) {
        if (table.has(m)) {
          errors.push({ line: a.line, msg: `"${m}" is already aligned on the ${a.axis} axis by another align statement` });
          continue;
        }
        table.set(m, { edge: a.edge, master });
        addDep(m, master);
      }
    }
    for (const s of model.spreads) {
      if (!s.members.every(m => nodeOnly(m, s.line, `spread ${s.axis}`))) continue;
      const first = s.members[0], last = s.members[s.members.length - 1];
      s.members.slice(1, -1).forEach((m, i) => {
        if (spreadAt.has(m)) {
          errors.push({ line: s.line, msg: `"${m}" is already distributed by another spread statement` });
          return;
        }
        spreadAt.set(m, { axis: s.axis, first, last, t: (i + 1) / (s.members.length - 1) });
        addDep(m, first);
        addDep(m, last);
      });
    }
    for (const n of model.nodes) {
      kindOf.set(n.id, 'node');
      const d = placeDeps(state.get(n.id).place);
      if (n.sameAs) d.push(n.sameAs);
      for (const x of (extraDeps.get(n.id) || [])) d.push(x);
      deps.set(n.id, d);
    }
    for (const c of model.containers) { kindOf.set(c.id, 'container'); deps.set(c.id, c.members.slice()); }
    for (const b of model.braces) { kindOf.set(b.id, 'brace'); deps.set(b.id, b.members.slice()); }

    const mark = new Map();
    const visit = (id, trail) => {
      if (mark.get(id) === 2) return;
      if (mark.get(id) === 1) {
        errors.push({ line: 0, msg: `placement cycle: ${[...trail, id].join(' → ')}` });
        mark.set(id, 2);
        return;
      }
      if (!deps.has(id)) return;
      mark.set(id, 1);
      for (const d of deps.get(id)) visit(d, [...trail, id]);
      mark.set(id, 2);
      order.push(id);
    };
    for (const id of deps.keys()) visit(id, []);

    const nodeById = new Map(model.nodes.map(n => [n.id, n]));
    const contById = new Map(model.containers.map(c => [c.id, c]));
    const braceById = new Map(model.braces.map(b => [b.id, b]));

    for (const id of order) {
      const st = state.get(id);
      if (nodeById.has(id)) {
        const node = nodeById.get(id);
        const { w, h, font, padX, padY } = sizeOf(node);
        const place = st.place;
        let cx = 0, cy = 0;
        if (!place) { cx = 0; cy = 0; }
        else if (place.kind === 'abs') { [cx, cy] = dgPairPx(place.at, boxes, uw, uh); }
        else if (place.kind === 'between') {
          const pts = place.refs.map(r => {
            const rb = boxes.get(r.ref);
            if (!rb) return [0, 0];
            return r.anchor ? dgAnchorPt(rb, r.anchor, r.frac) : [rb.x + rb.w / 2, rb.y + rb.h / 2];
          });
          const f = place.frac;
          cx = pts[0][0] + (pts[1][0] - pts[0][0]) * f;
          cy = pts[0][1] + (pts[1][1] - pts[0][1]) * f;
        } else {
          const ref = boxes.get(place.ref);
          if (!ref) { cx = 0; cy = 0; }
          else if (place.dir === 'right' || place.dir === 'left') {
            cx = place.dir === 'right'
              ? ref.x + ref.w + place.gap * uw + w / 2
              : ref.x - place.gap * uw - w / 2;
            cy = place.align === 'top' ? ref.y + h / 2
              : place.align === 'bottom' ? ref.y + ref.h - h / 2
              : ref.y + ref.h / 2;
          } else {
            cy = place.dir === 'below'
              ? ref.y + ref.h + place.gap * uh + h / 2
              : ref.y - place.gap * uh - h / 2;
            cx = place.align === 'left' ? ref.x + w / 2
              : place.align === 'right' ? ref.x + ref.w - w / 2
              : ref.x + ref.w / 2;
          }
        }
        // The offset is part of the placement expression, so it lands before
        // align/spread override the result – otherwise an element written as
        // `between a,b offset 0,1.35` and then aligned got the offset twice,
        // once through its own placement and once on top of the master's
        // coordinate. A step's `move … by` is a later act and still survives.
        if (place && place.offset) { cx += place.offset[0] * uw; cy += place.offset[1] * uh; }
        const ax = alignX.get(id);
        if (ax) {
          const m = boxes.get(ax.master);
          if (m) cx = ax.edge === 'left' ? m.x + w / 2
            : ax.edge === 'right' ? m.x + m.w - w / 2
            : m.x + m.w / 2;
        }
        const ay = alignY.get(id);
        if (ay) {
          const m = boxes.get(ay.master);
          if (m) cy = ay.edge === 'top' ? m.y + h / 2
            : ay.edge === 'bottom' ? m.y + m.h - h / 2
            : m.y + m.h / 2;
        }
        const sp = spreadAt.get(id);
        if (sp) {
          const a = boxes.get(sp.first), z = boxes.get(sp.last);
          if (a && z) {
            const ca = sp.axis === 'x' ? a.x + a.w / 2 : a.y + a.h / 2;
            const cz = sp.axis === 'x' ? z.x + z.w / 2 : z.y + z.h / 2;
            const v = ca + (cz - ca) * sp.t;
            if (sp.axis === 'x') cx = v; else cy = v;
          }
        }
        cx += st.shift[0] * uw;
        cy += st.shift[1] * uh;
        boxes.set(id, { x: cx - w / 2, y: cy - h / 2, w, h, font, padX, padY });
        continue;
      }
      const holder = contById.get(id) || braceById.get(id);
      if (!holder) continue;
      // Fit the members that are on screen, the same rule an edge follows:
      // a container drawn around a box nobody can see yet is a slab of empty
      // paper, and it is the re-fitting that makes `move` read as a member
      // joining or leaving the set. All members hidden falls back to fitting
      // them all – the holder is invisible at that beat anyway (see
      // dgFrameDrawables), and a zero-extent box would poison the viewBox.
      const allBoxes = holder.members.map(m => boxes.get(m)).filter(Boolean);
      const shown = holder.members.filter(m => state.get(m) && state.get(m).visible)
        .map(m => boxes.get(m)).filter(Boolean);
      const memberBoxes = shown.length ? shown : allBoxes;
      if (!memberBoxes.length) { boxes.set(id, { x: 0, y: 0, w: 0, h: 0 }); continue; }
      const bb = dgUnion(memberBoxes);
      if (contById.has(id)) {
        const pad = holder.pad * uh;
        const labelH = holder.label ? dgFontFor(state.get(id).classes) * DG_LINE_H + 4 : 0;
        const shift = state.get(id).shift;
        boxes.set(id, {
          x: bb.x - pad + shift[0] * uw,
          y: bb.y - pad - labelH + shift[1] * uh,
          w: bb.w + 2 * pad,
          h: bb.h + 2 * pad + labelH,
          labelH,
        });
        continue;
      }
      // brace: the span it covers, plus whatever a step shifted it by – the
      // offset to the side is applied at draw time.
      const bshift = state.get(id).shift;
      boxes.set(id, { x: bb.x + bshift[0] * uw, y: bb.y + bshift[1] * uh, w: bb.w, h: bb.h });
    }

    return boxes;
  }

  function dgFrameDrawables(model, state, boxes, labelIndex) {
    const [uw, uh] = model.unit;
    const geom = new Map();
    const ext = new Map();     // label id -> measured [w, h], for the viewBox
    const labelAnchor = new Map();   // element id -> text-anchor, where it is not middle
    // element id -> [boxW, boxH, padX, padY] for a `.fit` / `.shrink` element,
    // so the emitter can solve the size for each pre-rendered label variant
    // rather than for the one that happens to be on screen.
    const fits = new Map();
    // A free `text` draws a ground only when it has a tone – but a `style`
    // step can give it one, and a geometry key present in only some frames
    // would leave the rect stranded in the others. So the rect is emitted in
    // every frame of any text that carries a tone in *any* of them, and the
    // class decides whether it paints.
    const styleFilled = new Set();
    for (const s of model.steps) {
      for (const op of s.ops) {
        if (op.op !== 'style' || !(op.classes || []).some(c => DG_FILL_CLASSES.includes(c))) continue;
        for (const t of (op.targets || [])) {
          for (const id of (t.startsWith('@') ? (model.tags.get(t.slice(1)) || []) : [t])) styleFilled.add(id);
        }
      }
    }
    const vis = new Map();
    const cls = new Map();
    const lab = new Map();

    const put = (el, drawId, vec) => geom.set(drawId, vec);
    const record = (el) => {
      const st = state.get(el.id);
      vis.set(el.id, dgOpacity(st.visible, st.classes));
      cls.set(el.id, [...st.classes].join(' '));
      const variants = labelIndex.get(el.id);
      if (variants) lab.set(el.id, Math.max(0, variants.indexOf(st.label)));
      return st;
    };

    // Where the label's origin sits has to match the text-anchor it will be
    // rendered with, or the layout box and the drawn glyphs disagree: a
    // `.left` label was positioned by its centre but drawn rightwards from
    // that point, so it ran half its own width into whatever came next.
    // Only free `text` honours .left/.right; a label inside a shape stays
    // centred in it.
    const labelBox = (el, st, box, freeText) => {
      if (!st.label) return;
      // Record what the label actually measures, so the viewBox can hold it.
      // Approximating every label as a fixed box let a long one draw outside
      // the figure, where overflow: visible happily painted it over the prose.
      // The size comes off the laid-out box rather than from the classes:
      // under `.fit` the two differ, and the viewBox has to hold what is drawn.
      const font = box.font ?? dgFontFor(st.classes);
      const m = dgMeasure(st.label, font, st.classes.has('mono'));
      ext.set(el.id + '--l', [m.w, m.h]);
      const x = !freeText ? box.x + box.w / 2
        : st.classes.has('left') ? box.x
        : st.classes.has('right') ? box.x + box.w
        : box.x + box.w / 2;
      put(el, el.id + '--l', [x, box.y + box.h / 2]);
    };

    for (const node of model.nodes) {
      const st = record(node);
      const b = boxes.get(node.id);
      if (!b) continue;
      if (st.classes.has('fit') || st.classes.has('shrink')) {
        fits.set(node.id, [b.w, b.h, b.padX ?? DG_PAD_X, b.padY ?? DG_PAD_Y]);
      }
      // A label that grew a leader is only as visible as what it points at –
      // the third face of the same rule the edges and the holders follow. Its
      // stub was already hidden with the target, and words hanging in empty
      // space with the line to their subject missing read as a bug.
      if (node.leaderRef) {
        const target = state.get(node.leaderRef);
        if (target && !target.visible) vis.set(node.id, 0);
      }
      if (node.kind === 'box') {
        put(node, node.id + '--r', [b.x, b.y, b.w, b.h]);
        labelBox(node, st, b, false);
      } else if (node.kind === 'dot') {
        put(node, node.id + '--c', [b.x + b.w / 2, b.y + b.h / 2, b.w / 2]);
        labelBox(node, st, b, false);
      } else if (node.kind === 'image') {
        put(node, node.id + '--i', [b.x, b.y, b.w, b.h]);
      } else {
        // A free `text` draws a ground only when the author gave it one. The
        // rect goes through `put` like any other drawable, so `extentsOf`
        // counts it in the viewBox: a padded box at the edge of a figure is
        // wider than the bare glyph run it replaced, and a frame computed from
        // the label alone would clip it.
        if (dgHasFill(st.classes) || styleFilled.has(node.id)) {
          const px = b.padX ?? DG_PAD_X, py = b.padY ?? DG_PAD_Y;
          put(node, node.id + '--r', [b.x - px, b.y - py, b.w + 2 * px, b.h + 2 * py]);
        }
        labelBox(node, st, b, true);
      }
    }

    // A container or a brace is only as visible as the set it holds, for the
    // same reason an edge is only as visible as its endpoints: an outline
    // around nothing is never what the author meant, and making it the rule
    // means a holder needs no `show` of its own.
    const holdsSomething = (h) => h.members.some(m => state.get(m) && state.get(m).visible);
    for (const c of model.containers) {
      const st = record(c);
      if (!holdsSomething(c)) vis.set(c.id, 0);
      const b = boxes.get(c.id);
      if (!b) continue;
      put(c, c.id + '--r', [b.x, b.y, b.w, b.h]);
      // A container's caption sits on its own top edge rather than inside
      // the members' space, so adding a caption never reflows the contents.
      if (st.label) {
        // Measure it, like every other label. Three of the four places that
        // position a label used to skip this, and extentsOf then fell back to
        // a hardcoded [120, 28] - so a caption of any length at all reserved
        // exactly 120px of paper beside the figure, which is where the wide
        // empty margins came from.
        const cm = dgMeasure(st.label, dgFontFor(st.classes), st.classes.has('mono'));
        ext.set(c.id + '--l', [cm.w, cm.h]);
        put(c, c.id + '--l', [b.x + 10, b.y + (b.labelH || 0) / 2 + 1]);
      }
    }

    for (const br of model.braces) {
      const st = record(br);
      if (!holdsSomething(br)) vis.set(br.id, 0);
      const b = boxes.get(br.id);
      if (!b) continue;
      const pad = br.pad * uh, tick = DG_BRACE_TICK;
      let pts, lp, lanchor = 'middle';
      if (br.side === 'right') {
        const x = b.x + b.w + pad;
        pts = [[x, b.y], [x + tick, b.y], [x + tick, b.y + b.h], [x, b.y + b.h]];
        lp = [x + tick + 8, b.y + b.h / 2];
        lanchor = 'start';
      } else if (br.side === 'left') {
        const x = b.x - pad;
        pts = [[x, b.y], [x - tick, b.y], [x - tick, b.y + b.h], [x, b.y + b.h]];
        lp = [x - tick - 8, b.y + b.h / 2];
        lanchor = 'end';
      } else if (br.side === 'top') {
        const y = b.y - pad;
        pts = [[b.x, y], [b.x, y - tick], [b.x + b.w, y - tick], [b.x + b.w, y]];
        lp = [b.x + b.w / 2, y - tick - 9];
      } else {
        const y = b.y + b.h + pad;
        pts = [[b.x, y], [b.x, y + tick], [b.x + b.w, y + tick], [b.x + b.w, y]];
        lp = [b.x + b.w / 2, y + tick + 9];
      }
      put(br, br.id + '--p', pts.flat());
      if (st.label) {
        const bm = dgMeasure(st.label, dgFontFor(st.classes), st.classes.has('mono'));
        ext.set(br.id + '--l', [bm.w, bm.h]);
        put(br, br.id + '--l', lp);
        labelAnchor.set(br.id, lanchor);
      }
    }

    for (const e of model.edges) {
      // An edge is only ever as visible as the two things it connects. An
      // arrow pointing at a box that has not appeared yet is never what the
      // author meant, and making it the rule means most edges need no `show`
      // of their own – revealing the boxes reveals the arrows between them.
      const ends = [e.from, e.to].filter(r => !r.point).map(r => state.get(r.ref));
      const st = record(e);
      if (ends.some(s => s && !s.visible)) vis.set(e.id, 0);
      const endBox = (r) => {
        if (!r.point) return boxes.get(r.ref);
        const [px, py] = dgPairPx(r.point, boxes, uw, uh);
        return { x: px, y: py, w: 0, h: 0 };
      };
      const fb = endBox(e.from), tb = endBox(e.to);
      if (!fb || !tb) continue;
      const viaPx = e.via.map(p => dgPairPx(p, boxes, uw, uh));
      const towardFrom = viaPx[0] || [tb.x + tb.w / 2, tb.y + tb.h / 2];
      const towardTo = viaPx[viaPx.length - 1] || [fb.x + fb.w / 2, fb.y + fb.h / 2];
      const aFrom = e.from.anchor || dgAutoAnchor(fb, towardFrom);
      const aTo = e.to.anchor || dgAutoAnchor(tb, towardTo);
      const start = dgAnchorPt(fb, aFrom, e.from.frac ?? 0.5);
      const end = dgAnchorPt(tb, aTo, e.to.frac ?? 0.5);
      const pts = [start, ...viaPx, end];

      const headed = !st.classes.has('no-head');
      const both = st.classes.has('both-heads');
      // Pull the stroke back from the tip so a thick head is not printed
      // over by the line it terminates.
      const trim = (a, b, by) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        return [b[0] - (dx / len) * by, b[1] - (dy / len) * by];
      };
      const drawPts = pts.map(p => p.slice());
      if (headed) drawPts[drawPts.length - 1] = trim(pts[pts.length - 2], pts[pts.length - 1], DG_HEAD * 0.85);
      if (both) drawPts[0] = trim(pts[1], pts[0], DG_HEAD * 0.85);
      put(e, e.id + '--p', drawPts.flat());
      // A line that is 2° off horizontal is almost never intent; it is two
      // endpoints that were meant to line up and did not, and on a projection
      // it reads as a mistake. Say so, and name the verb that fixes it.
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        if (!dx && !dy) continue;
        const deg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
        const off = Math.min(deg % 90, 90 - (deg % 90));
        if (off > 0.05 && off < DG_SKEW_DEG) {
          dgWarn(`edge ${e.id} runs ${off.toFixed(1)}° off the axis – its endpoints are probably `
            + `meant to line up. Either "align" the two elements, or, if the edge uses a `
            + `fractional anchor, give them the same height ("same as") – a fraction of two `
            + `different heights lands at two different places.`);
          break;
        }
      }

      const head = (tip, from) => {
        const dx = tip[0] - from[0], dy = tip[1] - from[1], len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, w = DG_HEAD * 0.44;
        return [
          tip[0], tip[1],
          tip[0] - ux * DG_HEAD + -uy * w, tip[1] - uy * DG_HEAD + ux * w,
          tip[0] - ux * DG_HEAD - -uy * w, tip[1] - uy * DG_HEAD - ux * w,
        ];
      };
      if (headed) put(e, e.id + '--h', head(pts[pts.length - 1], pts[pts.length - 2]));
      if (both) put(e, e.id + '--h2', head(pts[0], pts[1]));

      if (st.label) {
        const { p, dir } = dgPolyPoint(pts, 0.5);
        const font = dgFontFor(st.classes);
        const m = dgMeasure(st.label, font, st.classes.has('mono'));
        const off = m.h / 2 + 6;
        ext.set(e.id + '--l', [m.w, m.h]);
        put(e, e.id + '--l', [p[0] + dir[1] * off, p[1] - dir[0] * off]);
      }
    }

    return { geom, vis, cls, lab, ext, labelAnchor, fits };
  }

  // Every distinct label an element ever carries, so a `label` step is a
  // visibility switch between pre-rendered variants instead of text surgery
  // in the browser. Keeps the runtime free of any typesetting code.
  // ── diagram emission ────────────────────────────────────────────────

  function dgTspans(spans, font, baseline) {
    const shiftPx = (s) => (s === -1 ? font * 0.26 : s === 1 ? font * -0.42 : 0);
    let prev = 0, first = true, out = '';
    for (const sp of spans) {
      const dy = shiftPx(sp.shift) - prev;
      prev = shiftPx(sp.shift);
      const size = sp.shift ? ` font-size="${(font * 0.72).toFixed(2)}"` : '';
      const pos = first ? ` x="0" y="${baseline.toFixed(2)}"` : '';
      const cls = sp.cls ? ` class="dg-${sp.cls}"` : '';
      out += `<tspan${pos}${dy ? ` dy="${dy.toFixed(2)}"` : ''}${size}${cls}>${escapeHtml(sp.t)}</tspan>`;
      first = false;
    }
    return out;
  }

  function dgTextEl(id, label, classes, extraClass, anchorOverride, fontPx) {
    const font = fontPx || dgFontFor(classes);
    const mono = classes.has('mono');
    const m = dgMeasure(label, font, mono);
    const anchor = anchorOverride
      || (classes.has('left') ? 'start' : classes.has('right') ? 'end' : 'middle');
    const lineH = font * DG_LINE_H;
    const top = -((m.count - 1) * lineH) / 2;
    let inner = '';
    m.lines.forEach((spans, i) => {
      inner += dgTspans(spans, font, top + i * lineH + font * 0.34);
    });
    return `<g id="${id}" class="dg-lbl${extraClass ? ' ' + extraClass : ''}">`
      + `<text text-anchor="${anchor}" font-size="${font.toFixed(2)}"${mono ? ' class="dg-mono"' : ''}>${inner}</text></g>`;
  }

  // A vector asset is spliced in as a nested <svg> rather than referenced
  // through <image href="data:…">, for the same reason inlineSvg() exists at
  // all: an <image> lives in an isolated document context and inherits none
  // of the page's custom properties, so it would not re-colour with the A
  // theme cycle. A nested <svg> is in the same document and does.
  //
  // A raster cannot follow the theme, and that is simply the trade: a
  // photograph is a photograph in every mode. It is inlined as a data: URI so
  // the output stays one file.
  // A vector asset is spliced in as a nested <svg> rather than referenced
  // through <image href="data:…">, for the same reason inlineSvg() exists at
  // all: an <image> lives in an isolated document context and inherits none
  // of the page's custom properties, so it would not re-colour with the A
  // theme cycle. A nested <svg> is in the same document and does.
  //
  // A raster cannot follow the theme, and that is simply the trade: a
  // photograph is a photograph in every mode. It is inlined as a data: URI so
  // the output stays one file.
  //
  // Both of those need the file, so the markup itself is the injected leaf.
  // What stays here is the part that is the same in both runtimes: where the
  // picture goes, and what to draw when the asset is missing.
  function dgImageEl(node, prefix, v) {
    const id = `${prefix}${node.id}--i`;
    const [x, y, w, h] = v;
    const geo = ` x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0, w).toFixed(2)}" height="${Math.max(0, h).toFixed(2)}"`;
    if (!node.asset) return `<rect id="${id}" class="dg-missing"${geo}/>`;
    return assetMarkup(node, id, geo)
      || `<rect id="${id}" class="dg-missing"${geo}/>`;
  }

  // What the browser needs to re-emit an image without a filesystem: for each
  // asset the diagram references, the markup the build already produced, with
  // the element id and the geometry lifted out as placeholders. Keyed by the
  // asset reference rather than by element id, so the editor can also place a
  // *new* image using an asset the lecture already carries.
  //
  // This is the browser half of the `assetMarkup` leaf, and building it from
  // the same call the build makes is what keeps a re-render byte-identical.
  function imageTable(model) {
    const out = {};
    for (const n of model.nodes) {
      if (n.kind !== 'image' || !n.asset || out[n.src]) continue;
      // Two probes, because the accessible name is not a substring the
      // caller can splice: it is carried by a whole construct that is absent
      // when there is none – `role="img" aria-label="…"` on a spliced vector,
      // `<title>…</title>` on a raster. So the build produces both shapes and
      // the browser picks, rather than the browser learning which attribute
      // to delete. That knowledge lives with inlineSvg, and only there.
      //
      // Keyed by the asset reference, not by element id, so a *new* image
      // the editor places can use an asset the lecture already carries. Two
      // elements sharing one asset with different alt text is exactly the
      // case that made this a placeholder rather than baked-in markup – the
      // identity check found `bob` labelled "Eve".
      const named = assetMarkup({ ...n, alt: '\u0000ALT\u0000' }, '\u0000ID\u0000', '\u0000GEO\u0000');
      const bare = assetMarkup({ ...n, alt: '' }, '\u0000ID\u0000', '\u0000GEO\u0000');
      if (!named) continue;
      // One copy, not two. The markup is the whole asset – a data: URI or a
      // spliced vector file – so shipping both shapes doubled the heaviest
      // thing in the payload for the sake of one construct that is present
      // or absent. Store the named shape plus the range to cut out for an
      // element with no accessible name, computed from the common prefix
      // and suffix of the two.
      let a = 0;
      while (a < named.length && a < bare.length && named[a] === bare[a]) a++;
      let z = 0;
      while (z < named.length - a && z < bare.length - a
             && named[named.length - 1 - z] === bare[bare.length - 1 - z]) z++;
      out[n.src] = {
        markup: named,
        drop: [a, named.length - z - a],
        aspect: n.aspect ?? null,
      };
    }
    return out;
  }

  function renderDiagram(body, headAttrs, opts = {}) {
    const { model, errors } = parseDiagramSource(body, headAttrs, opts.base);
    // A lecture-level `default <kind> @tag` is written once for twelve
    // diagrams and most of them will not carry the tag, so the block-level
    // "no element carries @tag" error cannot apply to it. The rule is one
    // scope wider instead – it has to be used *somewhere in the lecture* –
    // and only the caller can see that far. `onCompile` is how it collects
    // the evidence; parseLecture rules on it after the last chunk.
    if (opts.onCompile) opts.onCompile(model);
    const labelIndex = dgLabelVariants(model);
    const frameCount = model.steps.length + 1;
    const frames = [];
    for (let k = 0; k < frameCount; k++) {
      const state = dgStateAt(model, k);
      const boxes = layoutDiagram(model, state, errors);
      frames.push(dgFrameDrawables(model, state, boxes, labelIndex));
    }
    // Layout runs once per step against one errors array, so a single mistake
    // was reported once per step. Deduplicate before speaking.
    if (errors.length) {
      const seen = new Set();
      for (let i = errors.length - 1; i >= 0; i--) {
        const key = errors[i].line + '\u0000' + errors[i].msg;
        if (seen.has(key)) errors.splice(i, 1);
        else seen.add(key);
      }
      const where = opts.where ? ` in ${opts.where}` : '';
      const err = new Error(
        `::: diagram${model.id ? ` #${model.id}` : ''}${where} has ${errors.length} problem(s):\n` +
        errors.map(e => `  ${e.line ? `line ${e.line} of the block: ` : ''}${e.msg}`).join('\n')
      );
      err.userFacing = true;
      throw err;
    }

    // The caller may pin the prefix. The browser does, because it is
    // re-rendering a figure the build already named and the names have to
    // agree – element ids are what the runtime, the sync protocol and the
    // editor's own selection all address.
    const prefix = opts.prefix || `dg${++dgCounter}-`;
    const elements = [
      ...model.containers.map(e => ({ e, kind: 'container' })),
      ...model.nodes.filter(e => e.kind === 'image').map(e => ({ e, kind: 'image' })),
      ...model.braces.map(e => ({ e, kind: 'brace' })),
      ...model.edges.map(e => ({ e, kind: 'edge' })),
      ...model.nodes.filter(e => e.kind !== 'image').map(e => ({ e, kind: e.kind })),
    ];

    // Print state: the last beat, with the lecture-time emphasis stripped. A
    // handout is the finished picture, not its first beat – and not the union
    // of every beat either: `hide` is the author saying an element is gone by
    // the end, so reprinting it lays a withdrawn arrow across whatever took
    // its place. Everything shown and never hidden is in the last beat anyway,
    // so this is the union for every diagram that only ever builds up.
    const last = frames[frames.length - 1];
    const printGeom = new Map(last.geom), printVis = new Map(), printCls = new Map(), printLab = new Map(last.lab);
    for (const [id, v] of last.vis) {
      // emph and dim are lecture-time acts, like the collapse mode – a handout
      // that arrives with three arrows greyed out is reporting a moment in the
      // talk, not the diagram. The opacity has to be recomputed from the
      // stripped classes rather than carried over: taking the step's number
      // kept a calmed element at 30% on paper, and pinning it to 1 threw away
      // an author's own .ghost.
      const stripped = String(last.cls.get(id) || '').split(/\s+/)
        .filter(c => c && c !== 'emph' && c !== 'dim');
      printVis.set(id, dgOpacity(v > 0, stripped));
      printCls.set(id, stripped.join(' '));
    }

    // Two boxes, because the two media want opposite things. The live views
    // need one that holds every frame, or a box walking in from the side is
    // clipped for the whole of its journey and the picture jumps under the
    // room's eyes. Print is a single still and wants the finished picture
    // tight; given the union it prints a band of empty paper the height of
    // wherever something started out.
    //
    // The static attribute is the print one, for the same reason the static
    // element attributes are the print state: a view with no JavaScript shows
    // the finished picture. The runtime widens it to the union on boot.
    const labelExt = new Map();
    for (const f of frames) for (const [k, v] of f.ext) labelExt.set(k, v);
    // A drawable belongs to the element whose id it is prefixed with; the
    // suffix after the last `--` names which drawable it is.
    const ownerOf = (gid) => (gid.lastIndexOf('--') > 0 ? gid.slice(0, gid.lastIndexOf('--')) : gid);
    const kindOf = new Map(elements.map(({ e, kind }) => [e.id, kind]));
    const anchorOf = new Map();
    for (const f of frames) for (const [k, v] of f.labelAnchor) anchorOf.set(k, v);
    // The extent of a label has to describe what the emitter will draw, so it
    // answers the anchor question exactly the way dgTextEl does. This used to
    // reserve a full label width on *each* side of the origin - a box twice
    // as wide as any label can be - which is where the odd empty margins came
    // from: a figure whose outermost element was a caption reserved half that
    // caption's width of paper beyond it and then sat off-centre inside its
    // own frame. Measured on lectures/diagrams before the fix: up to 110px on
    // one side of a figure only 480px wide.
    const anchorFor = (owner, f) => {
      if (kindOf.get(owner) === 'container') return 'start';
      const explicit = (f.labelAnchor && f.labelAnchor.get(owner)) || anchorOf.get(owner);
      if (explicit) return explicit;
      const cs = ' ' + (((f.cls && f.cls.get(owner)) || '')) + ' ';
      if (cs.includes(' left ')) return 'start';
      if (cs.includes(' right ')) return 'end';
      return 'middle';
    };
    const extentsOf = (f, into, visible) => {
      for (const [gid, vec] of f.geom) {
        if (visible && !visible(gid)) continue;
        if (gid.endsWith('--r') || gid.endsWith('--i')) into.push({ x: vec[0], y: vec[1], w: vec[2], h: vec[3] });
        else if (gid.endsWith('--c')) into.push({ x: vec[0] - vec[2], y: vec[1] - vec[2], w: vec[2] * 2, h: vec[2] * 2 });
        else if (gid.endsWith('--l')) {
          const [lw, lh] = (f.ext && f.ext.get(gid)) || labelExt.get(gid) || [120, 28];
          const a = anchorFor(ownerOf(gid), f);
          const x = a === 'start' ? vec[0] : a === 'end' ? vec[0] - lw : vec[0] - lw / 2;
          into.push({ x, y: vec[1] - lh / 2, w: lw, h: lh });
        }
        else for (let i = 0; i < vec.length; i += 2) into.push({ x: vec[i], y: vec[i + 1], w: 0, h: 0 });
      }
    };
    const liveBoxes = [];
    for (const f of frames) extentsOf(f, liveBoxes);
    const printBoxes = [];
    // printCls, not last.cls: anchorFor reads the classes to decide which side
    // of its origin a label occupies, and a pass handed no classes at all
    // silently treats every label as centred - which under-reserves a `.right`
    // one by half its width and clips it off the edge of the paper.
    extentsOf({ geom: printGeom, ext: last.ext, cls: printCls, labelAnchor: last.labelAnchor },
      printBoxes, (gid) => (printVis.get(ownerOf(gid)) ?? 1) > 0);
    const boxFor = (list) => {
      const bb = list.length ? dgUnion(list) : { x: 0, y: 0, w: 100, h: 100 };
      return [bb.x - DG_MARGIN, bb.y - DG_MARGIN,
        Math.max(bb.w + 2 * DG_MARGIN, 1), Math.max(bb.h + 2 * DG_MARGIN, 1)];
    };
    const [lvX, lvY, lvW, lvH] = boxFor(liveBoxes.concat(printBoxes));
    const [vbX, vbY, vbW, vbH] = boxFor(printBoxes.length ? printBoxes : liveBoxes);

    const kinds = {};
    const fitOf = new Map();
    for (const f of frames) for (const [k, v] of f.fits) fitOf.set(k, v);
    let svgBody = '';
    for (const { e, kind } of elements) {
      const st = printCls.get(e.id) ?? e.classes.join(' ');
      // A style rather than the presentation attribute, for the same reason
      // the runtime uses one: author CSS would otherwise win.
      const op = printVis.get(e.id) || 0;
      const on = op === 1 ? '' : ` style="opacity:${op}"`;
      let inner = '';
      const g = (suffix) => printGeom.get(e.id + suffix);
      if (kind === 'box' || kind === 'container') {
        kinds[e.id + '--r'] = 'rect';
        const v = g('--r') || [0, 0, 0, 0];
        inner += `<rect id="${prefix}${e.id}--r" x="${v[0].toFixed(2)}" y="${v[1].toFixed(2)}" width="${v[2].toFixed(2)}" height="${v[3].toFixed(2)}" rx="4"/>`;
      } else if (kind === 'dot') {
        kinds[e.id + '--c'] = 'circle';
        const v = g('--c') || [0, 0, 1];
        inner += `<circle id="${prefix}${e.id}--c" cx="${v[0].toFixed(2)}" cy="${v[1].toFixed(2)}" r="${v[2].toFixed(2)}"/>`;
      } else if (kind === 'image') {
        kinds[e.id + '--i'] = 'rect';
        const v = g('--i') || [0, 0, 0, 0];
        inner += dgImageEl(e, prefix, v);
      } else if (kind === 'edge' || kind === 'brace') {
        kinds[e.id + '--p'] = 'path';
        inner += `<path id="${prefix}${e.id}--p" class="dg-stroke" d="${dgPathD(g('--p') || [0, 0])}" fill="none"/>`;
        for (const suffix of ['--h', '--h2']) {
          if (!printGeom.has(e.id + suffix) && !frames.some(f => f.geom.has(e.id + suffix))) continue;
          kinds[e.id + suffix] = 'path';
          const hv = g(suffix) || frames[0].geom.get(e.id + suffix) || [0, 0];
          inner += `<path id="${prefix}${e.id}${suffix}" class="dg-head" d="${dgPathD(hv)}Z"/>`;
        }
      } else if (kind === 'text' && frames.some(f => f.geom.has(e.id + '--r'))) {
        // The ground behind a free text, when it has one. Same drawable as a
        // box's, so it tweens and themes identically; whether it paints is the
        // fill class, which is how one mechanism covers "a box defaults to
        // paper, a text defaults to see-through".
        kinds[e.id + '--r'] = 'rect';
        const v = g('--r') || frames[0].geom.get(e.id + '--r') || [0, 0, 0, 0];
        inner += `<rect id="${prefix}${e.id}--r" x="${v[0].toFixed(2)}" y="${v[1].toFixed(2)}" width="${v[2].toFixed(2)}" height="${v[3].toFixed(2)}" rx="4"/>`;
      }
      const variants = labelIndex.get(e.id) || [];
      variants.forEach((text, i) => {
        const drawId = `${prefix}${e.id}--l${i}`;
        kinds[e.id + '--l'] = 'text';
        const classes = new Set(String(st).split(/\s+/).filter(Boolean));
        const v = printGeom.get(e.id + '--l') || [0, 0];
        const shown = (printLab.get(e.id) ?? 0) === i;
        const extra = (variants.length > 1 ? 'dg-variant' : '') + (shown ? '' : ' dg-off');
        inner += `<g id="${prefix}${e.id}--lw${i}" data-lab="${e.id}--l" class="dg-lwrap${extra ? ' ' + extra.trim() : ''}" transform="translate(${v[0].toFixed(2)},${v[1].toFixed(2)})">`
          // A container's caption is positioned at its left edge, so it has to
          // be drawn from there – anchored middle it hung half its own width
          // outside the border it belongs to.
          // Under `.fit` every variant is solved for its own text: a `label`
          // step swaps pre-rendered <g>s, so each one has to have been
          // typeset at the size that makes *that* string fill the box.
          + dgTextEl(drawId, text, classes, kind === 'container' ? 'dg-caption' : '',
                     kind === 'container' ? 'start' : (anchorOf.get(e.id) || null),
                     fitOf.has(e.id) ? dgFitFont(text, classes, ...fitOf.get(e.id)) : 0) + '</g>';
      });
      const base = `dg-el dg-${kind}`;
      svgBody += `<g id="${prefix}${e.id}" data-base="${base}" class="${base}${st ? ' ' + st : ''}"${on}>${inner}</g>\n`;
    }

    const payload = {
      p: prefix,
      n: frameCount,
      kinds,
      names: model.steps.map(s => s.name),
      frames: frames.map(f => ({
        vis: Object.fromEntries(f.vis),
        cls: Object.fromEntries(f.cls),
        lab: Object.fromEntries(f.lab),
        geom: Object.fromEntries([...f.geom].map(([k, v]) => [k, v.map(n => Math.round(n * 100) / 100)])),
      })),
    };

    const svgId = `${prefix}root`;
    const aria = opts.alt ? ` role="img" aria-label="${escapeHtml(opts.alt)}"` : ' role="img"';
    // An intrinsic width/height as well as the viewBox, and both the presence
    // and the *value* are load-bearing.
    //
    // Presence: a figure chunk centres its content with align-items, so the
    // body column is shrink-to-fit and asks its child how wide it wants to
    // be. An <img> answers with the file's pixel size; an <svg> carrying only
    // a viewBox has no answer and falls back to the CSS default 300x150 –
    // which is how a diagram came out postage-stamp sized on a full slide.
    //
    // Value: DG_NOMINAL_W rather than the viewBox width, so the answer is
    // always larger than any column and max-width: 100% always binds. That
    // makes the drawing fill its chunk's measure on every screen instead of
    // sitting at a fixed pixel size that shrinks, relatively, on a big
    // projector. The consequence is the useful one: `unit` sets only the
    // proportions inside the picture, and how large it lands is the chunk's
    // width class, exactly like every other figure.
    const liveVb = `${lvX.toFixed(2)} ${lvY.toFixed(2)} ${lvW.toFixed(2)} ${lvH.toFixed(2)}`;
    const svg = `<svg id="${svgId}" class="psi-diagram" viewBox="${vbX.toFixed(2)} ${vbY.toFixed(2)} ${vbW.toFixed(2)} ${vbH.toFixed(2)}" `
      + `width="${DG_NOMINAL_W}" height="${Math.round(DG_NOMINAL_W * vbH / vbW)}" `
      + (frameCount > 1 ? `data-live-viewbox="${liveVb}" data-live-ratio="${(lvH / lvW).toFixed(6)}" ` : '')
      + `data-steps="${frameCount}"${aria} preserveAspectRatio="xMidYMid meet">\n${svgBody}</svg>`;
    const script = frameCount > 1
      ? `<script type="application/json" class="psi-diagram-frames" data-for="${svgId}">`
        + JSON.stringify(payload).replace(/</g, '\\u003c') + '</script>'
      : '';
    const hint = frameCount > 1 ? '<figcaption class="dg-hint"></figcaption>' : '';
    // The block's own source, riding along with the picture it compiled to.
    // The editor opens a figure by parsing this and re-running this same
    // compiler; `range` is where those bytes live in source.md, which is what
    // a write-back patches and what makes the whole round trip checkable.
    //
    // Emitted into print as well, and that is fine: a diagram body is a few
    // hundred bytes to a couple of kilobytes, and stripping it per view would
    // mean compiling every diagram twice. renderDiagram is called once, at
    // parse time, and its HTML goes into all four views.
    const srcPayload = `<script type="application/json" class="psi-diagram-source" data-for="${svgId}">`
      + JSON.stringify({
        body: String(body),
        attrs: String(headAttrs || ''),
        range: opts.range || null,
        chunk: opts.chunk || null,
        width: opts.width || null,
        // The figure's accessible name, which the build takes from the
        // chunk heading. Carried here because the browser has no other way
        // to it, and without it a re-render differs from the build's own
        // SVG by exactly one attribute – which is how the identity check
        // found it.
        alt: opts.alt || '',
      }).replace(/</g, '\\u003c') + '</script>';
    // The asset table is its own element, because it is the only heavy part
    // and the only part a view that does not ship the editor has no use for.
    // Print and `editor: none` strip it; see stripDiagramAssets in build.js.
    const assets = imageTable(model);
    const assetPayload = Object.keys(assets).length
      ? `<script type="application/json" class="psi-diagram-assets" data-for="${svgId}">`
        + JSON.stringify(assets).replace(/</g, '\\u003c') + '</script>'
      : '';
    return `<figure class="figure-diagram">${svg}${hint}${script}${srcPayload}${assetPayload}</figure>`;
  }


  return {
    parseDiagramSource, layoutDiagram, dgFrameDrawables, renderDiagram,
    resetCounter: () => { dgCounter = 0; },
  };
}
