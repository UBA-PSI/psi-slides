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
// A bare `dot`'s radius, in grid units, measured against uh like every
// other clearance in the grammar. It was 13 raw px, which is the one number
// in the layout that did not follow the block's `unit=` - so the smaller an
// author's unit, the larger the dot came out relative to everything around
// it, and a plot marker arrived taller than the cell it marked a point in.
// 0.18 * 72 = 12.96, so the default unit is unchanged to the pixel.
export const DG_DOT_R = 0.18;

// How far a leader stub stands off the words it leaves. Every other edge
// leaves a box with a border, so the stroke ending on the border reads as
// attached; a free `text` is a run of glyphs and the same line arrived
// touching the letters. Grid units, and applied at the text end only - the
// pointing end has to keep meeting its target exactly.
export const DG_LEAD_GAP = 0.11;

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
  // outline. `.round` / `.sharp` are the two rectangles; the other four are
  // other outlines entirely, which is why they share the slot – a hexagon has
  // no corner radius to argue about. All five are the same four numbers as a
  // rect, drawn with a different `d`, so extents, viewBox and tweening are
  // untouched. See dgShapeD.
  // `.diamond` is the one shape a room has been trained on since school: it
  // says a question is asked here. `.hex` stood in for it and read as "a
  // question" too, but never as *the* question mark of a flowchart.
  'round', 'sharp', 'hex', 'diamond', 'chevron', 'wedge', 'cross',
  // `.turn` reads the label bottom-to-top. Not decoration: a tall narrow
  // element (a firewall bar, a matrix row, a y axis) has room for a word only
  // along its long side, and the alternative is one letter per line.
  'turn',
  // type. `.serif` is the upright serif; `.hand` is the same family forced
  // italic and accented, and until there was a plain one the family was
  // reachable only through the annotation voice.
  'mono', 'serif', 'hand', 'small', 'large', 'bold',
  // type that fits the box it is in, rather than the box fitting the type
  'fit', 'shrink',
  // where the label sits in the space it has. `left` / `right` name an edge
  // of a horizontal run of text; `top` / `bottom` an edge of the block of
  // lines. Both mean "as far that way as the padding allows", not "on the
  // border" – the padding is what the word `aligned` is measured against.
  // Absent, a label is centred, which is right for almost every box; these
  // are for the ones where it is not, a tall element with a short label most
  // of all.
  'left', 'right', 'top', 'bottom',
  // edges. `.smooth` draws the same waypoints as a curve through them
  // rather than a run of segments – an interpolating spline, so a waypoint is
  // still exactly where the author put it. `.front` moves a line in front of
  // the boxes: drawing order is otherwise fixed, and it is right for an arrow
  // (a box should cover the line arriving at it) and wrong for an axis, which
  // came out as stubs showing in the gaps between the columns it ruled.
  // Called `.front` and not `.over`, because `over` is already the keyword
  // that gives a container its members.
  // `.elbow` is the one place the engine puts a coordinate on the page the
  // author did not write, and it is bounded on purpose: the rail is always
  // halfway across the gap, on whichever axis the two ends are further apart,
  // and there is no option to move it. It looks at nothing else in the figure,
  // so it is not routing – nothing steps around an obstacle for you – it is
  // the two waypoints every tree edge was written with by hand, said once.
  // An edge that needs its rail somewhere else writes `via`, and saying both
  // is an error rather than a silent preference.
  'no-head', 'both-heads', 'smooth', 'elbow', 'front',
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
  ['round', 'sharp', 'hex', 'diamond', 'chevron', 'wedge', 'cross'],   // outline
  ['small', 'large'],                         // size
  ['mono', 'serif', 'hand'],                  // family
  ['smooth', 'elbow'],                        // how a line is drawn
  ['fit', 'shrink'],                          // how type meets its box
  ['left', 'right'],                          // text alignment, across
  ['top', 'bottom'],                          // text alignment, down
];
// Not one slot, but the pair is still a mistake with no visible cause:
// .tone-4 fills with the accent and inverts its own label, so accent ink on
// it is invisible. The stylesheet arbitrates in favour of the inversion (the
// inversion rule is written after the accent one); the author should hear
// about it rather than wonder where the words went.
export const DG_CLASS_CLASHES = [['tone-4', 'accent']];

// The outlines that are not a rectangle. A box carrying one of these is
// emitted as a <path> instead of a <rect>, and the drawable kind recorded for
// it is the shape name rather than 'rect'.
//
// The whole extension rests on one decision: the geometry vector stays
// [x, y, w, h]. It is the same four numbers a rect has, so extentsOf still
// reads the bounding box correctly, the viewBox is still right, and a step
// that moves or resizes the element still tweens – the shape is only a
// different way of joining those four numbers into a path. Anything that
// needed its own point list would have needed its own everything.
export const DG_SHAPE_CLASSES = new Set(['hex', 'diamond', 'chevron', 'wedge', 'cross']);
// Which outlines have a point to aim, and where it may aim. `point` is an
// option rather than four more class names per shape: a chevron aimed up is
// the same shape aimed differently, and spelling that as its own class grows
// the vocabulary by one word per shape per direction. It also replaced
// `.chevron-left`, so the closed list came out one word shorter than it went
// in while covering eight orientations instead of three.
export const DG_POINTED = new Set(['chevron', 'wedge']);
export const DG_POINT_DIRS = new Set(['up', 'down', 'left', 'right']);

// How far `.turn` turns a label, in degrees, and it is negative because SVG
// rotates clockwise: -90 leaves the words reading bottom-to-top, which is the
// convention for a y axis and for the name written up the side of a bar.
//
// The angle travels as a third number on the label's own geometry vector
// rather than as a class the runtime has to look up, for the same reason the
// shapes reuse the rect's four numbers: everything downstream already knows
// how to carry, interpolate and apply a vector.
export const DG_TURN_DEG = -90;
// The angle for a resolved class set, and the only place the four sites that
// position a label ask the question. Three of them used to skip it entirely –
// a `.turn` on a container caption, a brace label or an edge label resolved,
// emitted its CSS and rotated nothing, which is exactly the silent no-op this
// grammar keeps closing.
export const dgTurnOf = (classes) => (classes && classes.has && classes.has('turn') ? DG_TURN_DEG : 0);

// Pure, importless, and stringified into the browser runtime by build.js, so
// exactly one text draws these shapes at build time and at step time. Keep it
// that way: a second copy would drift, and a shape that tweens to a slightly
// different outline than it was emitted with is the kind of defect nobody
// finds by looking.
export function dgShapeD(shape, x, y, w, h) {
  // The direction rides on the shape name (`chevron:up`), so the drawable
  // still carries four numbers and the runtime still looks a shape up by one
  // string. Rotating the finished points would have been the obvious move and
  // is the wrong one: a w-by-h box turned ninety degrees is an h-by-w box, and
  // the footprint the layout computed has to stay exactly what it was. Each
  // direction is drawn inside the box it was given.
  const [kind, dir] = String(shape).split(':');
  const n = (v) => Math.round(v * 100) / 100;
  const poly = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1])).join('') + 'Z';
  // How far the point eats into the box along the axis it points down. Tied to
  // the cross-axis so a row of boxes of one height gets one consistent nose,
  // and capped by its own axis so a very short box degenerates to a triangle
  // rather than folding through itself.
  const noseX = Math.min(h * 0.5, w * 0.42);
  const noseY = Math.min(w * 0.5, h * 0.42);
  const bevel = Math.min(h * 0.28, w * 0.34);
  const r = x + w, b = y + h, mx = x + w / 2, my = y + h / 2;
  if (kind === 'hex') {
    return poly([[x + bevel, y], [r - bevel, y], [r, my],
      [r - bevel, b], [x + bevel, b], [x, my]]);
  }
  if (kind === 'diamond') {
    return poly([[mx, y], [r, my], [mx, b], [x, my]]);
  }
  if (kind === 'chevron') {
    if (dir === 'left') return poly([[r, y], [x + noseX, y], [x, my], [x + noseX, b], [r, b]]);
    if (dir === 'up') return poly([[x, b], [x, y + noseY], [mx, y], [r, y + noseY], [r, b]]);
    if (dir === 'down') return poly([[x, y], [x, b - noseY], [mx, b], [r, b - noseY], [r, y]]);
    return poly([[x, y], [r - noseX, y], [r, my], [r - noseX, b], [x, b]]);
  }
  if (kind === 'cross') {
    // A plus rather than a saltire. At marker size a saltire reads as two
    // gridlines crossing; the arms of a plus stay on the axes the reader is
    // already following.
    const t = Math.min(w, h) * 0.34, hx = t / 2;
    return poly([[mx - hx, y], [mx + hx, y], [mx + hx, my - hx], [r, my - hx],
      [r, my + hx], [mx + hx, my + hx], [mx + hx, b], [mx - hx, b],
      [mx - hx, my + hx], [x, my + hx], [x, my - hx], [mx - hx, my - hx]]);
  }
  // wedge: a triangle standing on its point, which is how a size comparison
  // reads – the area is the quantity and the tip is where it lands.
  if (dir === 'up') return poly([[x, b], [r, b], [mx, y]]);
  if (dir === 'left') return poly([[r, y], [r, b], [x, my]]);
  if (dir === 'right') return poly([[x, y], [x, b], [r, my]]);
  return poly([[x, y], [r, y], [mx, b]]);
}

// The outline and the direction as one token, which is the form dgShapeD and
// the drawable kind both take. `chevron` on its own still means the default
// direction, so nothing that never says `point` changes.
export function dgShapeName(classes, dir) {
  const kind = dgShapeOf(classes);
  return kind && dir ? kind + ':' + dir : kind;
}

// Which outline an element draws, from its resolved class set. Takes either a
// Set or the space-separated string the emitter carries around.
export function dgShapeOf(classes) {
  const has = classes instanceof Set
    ? (c) => classes.has(c)
    : (c) => (' ' + String(classes || '') + ' ').includes(' ' + c + ' ');
  for (const s of DG_SHAPE_CLASSES) if (has(s)) return s;
  return '';
}

// Extra interior a shape needs beyond a rect's padding, so a label does not
// run into the point or the bevel. Returned in px and only ever *added* to a
// width the caller computed from the label – a box with an explicit `w` is the
// author's business, and the too-narrow warning already covers it.
//
// Derived from the height alone, never from the width, because the width is
// what this is being used to compute.
// A diamond is the one outline that eats *both* axes, and it eats them in
// proportion to the label rather than to the other axis: the widest room a
// diamond offers is a strip w/2 by h/2 through its centre, so a label that
// fits a rect lw by lh needs a diamond 2lw by 2lh. That is why this takes the
// label width as well. Every other shape answers from the cross-axis alone and
// ignores the two extra arguments, so old callers are unchanged.
export function dgShapeInsetX(shape, h, labelW = 0, padX = 0) {
  const [kind, dir] = String(shape).split(':');
  // A point that aims up or down eats height, not width, so it asks nothing
  // of the horizontal measure and dgShapeInsetY answers for it instead.
  const vertical = dir === 'up' || dir === 'down';
  if (kind === 'diamond') return labelW + 2 * padX;
  if (kind === 'hex') return Math.min(h * 0.28, 22) * 2;
  if (kind === 'chevron') return vertical ? 0 : Math.min(h * 0.5, 30);
  if (kind === 'wedge') return vertical || !dir ? h * 0.9 : 0;
  if (kind === 'cross') return h * 1.1;
  return 0;
}

// The same question on the other axis, driven by the label's own height
// because the box height is what it is being used to compute.
export function dgShapeInsetY(shape, labelH, padY = 0) {
  const [kind, dir] = String(shape).split(':');
  if (kind === 'diamond') return labelH + 2 * padY;
  if (dir !== 'up' && dir !== 'down') return 0;
  if (kind === 'chevron') return Math.min(labelH * 0.9, 26);
  if (kind === 'wedge') return labelH * 0.9;
  return 0;
}

export const DG_ANCHORS = new Set(['left', 'right', 'top', 'bottom', 'center', 'tl', 'tr', 'bl', 'br']);
// The statements that bring an element into being, as opposed to arranging
// or restyling ones that already exist. Not used by the compiler – it
// branches on each keyword by name – but the linter needs the set, and a
// second hand-written copy of the vocabulary is exactly what this module
// exists to stop.
export const DG_DEFINES = new Set(['box', 'dot', 'text', 'image', 'brace', 'container', 'bars', 'grid', 'plot', 'table', 'lanes']);
// Names an element cannot have, and it is a computed table rather than a
// list: the live runtime keys plain objects by element id (a frame's vis /
// cls / geom straight from JSON, the target cache, the kinds map), so an id
// that already means something on every JavaScript object – `constructor`,
// `toString`, `__proto__` – reads a function out of the prototype where the
// runtime expected its own entry, and the diagram breaks at step time with
// nothing at build time to say why. Refused at parse instead.
export const DG_RESERVED_IDS = new Set(Object.getOwnPropertyNames(Object.prototype));
// Scalar coordinates of an element, for use where a single number would go.
// `left`/`right` are x, `top`/`bottom` are y, `cx`/`cy` the centres. Naming
// the wrong axis is an error rather than a silent transposition.
export const DG_SCALAR_X = new Set(['cx', 'left', 'right']);
export const DG_SCALAR_Y = new Set(['cy', 'top', 'bottom']);

export const DG_STEP_OPS = new Set(['show', 'hide', 'move', 'emph', 'calm', 'style', 'label']);
export const DG_KEYWORDS = new Set(['box', 'dot', 'text', 'image', 'edge', 'brace', 'container', 'bars', 'grid', 'plot', 'table', 'lanes', 'align', 'spread', 'default', 'step']);
// What a `grid` may repeat. Not `text` – a grid of identical words is a
// paragraph, and not `edge`, which has two ends rather than a cell.
export const DG_GRID_KINDS = new Set(['box', 'dot', 'image']);
// A picture whose argument is "count the exceptions" stops making that
// argument long before this, and a runaway number here would be N elements
// through every step of the layout.
export const DG_GRID_MAX = 400;
// What a `bars` or a `grid` calls the elements it expands into. Four
// one-line functions rather than four sentences of prose, because both the
// compiler and lint.js have to agree on them exactly: the linter checks that
// `brace over f-0,f-1,f-2` names things that exist, and it re-implements the
// parsing contract rather than importing the compiler.
//
// This is the one place that rule bends. `lint.js` takes tables from this
// module and never a function, so that the whole compiler cannot come in
// behind one – but a naming scheme *is* a table, one that happens to be
// parameterised by an index, and writing it out twice is precisely the
// two-files-one-commit duplication importing the tables was meant to end.
export const dgBarName = (id, i) => `${id}-${i}`;
export const dgTickName = (id, i) => `${id}-tick-${i}`;
export const dgBaseName = (id) => `${id}-base`;
export const dgCellName = (id, c, r) => `${id}-${c}-${r}`;
// A table's cells are addressed the way a grid's are, column then row, and
// row 0 is the header – so `style @t-row-1 {.tone-4}` lights the first line
// of data and `@t-row-0` is the heading. The two tag families are the whole
// reason the statement earns its place: a row revealed per beat is one line
// of source, where twelve hand-named boxes needed a list.
export const dgRowTag = (id, r) => `${id}-row-${r}`;
export const dgColTag = (id, c) => `${id}-col-${c}`;
export const dgLaneName = (id, i) => `${id}-${i}`;
export const dgLaneCapName = (id, i) => `${id}-cap-${i}`;
// How wide a column is when the statement says nothing, and how tall a row
// is. Both in grid units; a table is the one figure where a sensible default
// matters more than control, because the alternative is a number per column.
export const DG_COL_W = 1.4;
export const DG_ROW_H = 0.42;
export const DG_LANE_H = 1.0;
export const DG_LANE_W = 4;
// How far a lane's turned caption sits outside the band, in grid units.
export const DG_LANE_CAP = 0.3;
// `plot` expands into a frame, two runs of grid lines, two runs of tick
// labels and up to two axis titles. Parts: gx gy xt yt xl yl.
export const dgPlotName = (id, part, i) => (i === undefined ? `${id}-${part}` : `${id}-${part}-${i}`);

// The tick values of one axis, low to high. Shared so the compiler and the
// linter agree on how many there are, which is how many names exist.
export function dgPlotTicks(lo, hi, step) {
  const out = [];
  if (!(step > 0) || !(hi > lo)) return out;
  // Counted rather than accumulated: adding 0.2 eleven times lands on
  // 1.0000000000000002 and prints a tick label nobody typed.
  const n = Math.round((hi - lo) / step);
  // The caller's error says a step that does not divide the range is refused,
  // and it has to be true: rounding up instead drew a gridline and a tick
  // label outside the frame and inflated the viewBox to hold them.
  if (Math.abs(n * step - (hi - lo)) > 1e-9) return [];
  for (let i = 0; i <= n; i++) out.push(Math.round((lo + i * step) * 1e6) / 1e6);
  return out;
}
export const DG_PLOT_MAX_TICKS = 40;

// `roc@0.35` names a value in a plot's own units. It is resolved here, after
// the whole block has been read, into the ordinary `<plot>.left+n` form – so
// a point may name a plot declared further down, and the layout never learns
// that plots exist. Everything below this line is the same coordinate the
// grammar always had.
export function dgResolvePlotCoords(model, plots, errors) {
  // One complaint per name. A figure that reads eight values out of a plot
  // that did not compile produced eight identical errors, which buries the one
  // on the plot's own line that says why.
  const said = new Set();
  const fix = (c, lineNo) => {
    if (!c || c.data === undefined) return c;
    const pl = plots.get(c.ref);
    if (!pl) {
      // Three different failures wore one sentence, and one of them came out
      // as "q is a plot, not a plot": `claim` records the kind from the
      // statement's first word, so a `plot` line that then failed on a later
      // option is *registered* as a plot and never *declared* as one. The name
      // is a plot's; the plot is not there. Say that, and point at the line
      // that already carries the real error rather than contradicting it.
      if (!said.has(c.ref)) {
        said.add(c.ref);
        const kind = model.byId.get(c.ref);
        dgErr(errors, lineNo, `"${c.ref}@${c.data}" reads a value in the plot "${c.ref}", `
          + (kind === 'plot'
            ? `but the plot statement for ${c.ref} did not compile – fix the error on its own line first`
            : kind
              ? `but ${c.ref} is a ${kind}, not a plot`
              : `but no plot of that name is declared in this block`));
      }
      return { unit: 0 };
    }
    const [lo, hi] = c.axis === 'x' ? pl.xDomain : pl.yDomain;
    const t = hi === lo ? 0 : (c.data - lo) / (hi - lo);
    // y grows downward on the page and upward in the data, which is the one
    // place a plot is not simply a box with lines in it.
    return c.axis === 'x'
      ? { ref: c.ref, prop: 'left', nudge: t * pl.w }
      : { ref: c.ref, prop: 'bottom', nudge: -t * pl.h };
  };
  const pair = (p, lineNo) => { if (p) { p[0] = fix(p[0], lineNo); p[1] = fix(p[1], lineNo); } };
  for (const n of model.nodes) if (n.place && n.place.kind === 'abs') pair(n.place.at, n.line);
  for (const e of model.edges) {
    for (const p of e.via) pair(p, e.line);
    if (e.from && e.from.point) pair(e.from.point, e.line);
    if (e.to && e.to.point) pair(e.to.point, e.line);
  }
  for (const s of model.steps) {
    for (const op of s.ops) if (op.to && op.to.kind === 'abs') pair(op.to.at, op.line);
  }
}
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
  container: ['pad'], brace: ['pad'], edge: ['pad'],
  // Not reachable from a `default` block – these two are not element kinds,
  // they are statements that expand into element kinds, and the elements they
  // produce take their defaults from `default box` like any other box. The
  // table is here because the linter reads it to check option names.
  // `emph` and `calm` here take a list of column numbers, and they mean on
  // the line what they already mean in a step. Without them a column could be
  // singled out from beat 1 onwards and never in the opening picture, which is
  // exactly where a chart usually wants one column to stand out.
  bars: ['w', 'h', 'space', 'emph', 'calm', 'aspect'], grid: ['cell', 'space'],
  plot: ['w', 'h', 'step', 'x', 'y', 'aspect'],
  table: ['w', 'h', 'space', 'col'], lanes: ['w', 'h'],
};
// Options whose value is a comma list rather than one number. `col 1.5,0.9,1.9`
// is one width per column, and reading it with dgNum would report the whole
// string as "not a number" instead of saying which column is wrong.
export const DG_LIST_OPTS = new Set(['col', 'emph', 'calm']);
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
// Which side of its origin a label sits on. Asked by the emitter when it
// writes `text-anchor` and by the extents when they reserve paper for it, and
// those two must not disagree. One function,
// so there is one answer.
//
// A turned label reads bottom-to-top and is centred on its origin whichever
// way, so the across-words have nothing to say about it.
//
// The two copies this replaced disagreed once already – a label reserved on
// the side it is not drawn on is how figures came to sit off-centre inside
// oversized frames.
export function dgLabelAnchor(classes) {
  const has = (c) => (classes.has ? classes.has(c) : classes.includes(c));
  if (has('turn')) return 'middle';
  if (has('left')) return 'start';
  if (has('right')) return 'end';
  return 'middle';
}

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
    // trailing option the element statements accept – *derived* from
    // DG_KIND_OPTS rather than spelled out, because the spelled-out list
    // predated `point`, `space`, `cell`, `step`, `x` and `y`, and each of
    // those written after a `between` was read as a member name and refused
    // with "expects exactly two elements". An order-sensitive refusal of
    // valid syntax is the invisible kind of failure this grammar keeps
    // closing; a derived set cannot drift the same way again.
    const STOP = new Set(['frac', 'offset', 'gap', 'align', 'same', '->', 'point',
      ...Object.values(DG_KIND_OPTS).flat()]);
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
  // `roc@0.35` – a value in a plot's own units. Still one token and still one
  // reference, so an editor rewrites it the way it rewrites a nudge. It is
  // turned into an ordinary `<plot>.left+n` by dgResolvePlotCoords once the
  // block has been read, which is what lets it name a plot declared further
  // down and costs the layout nothing.
  const p = raw.match(/^([A-Za-z_][\w-]*)@(-?[\d.]+)$/);
  if (p && Number.isFinite(Number(p[2]))) return { ref: p[1], data: Number(p[2]), axis };
  const m = raw.match(/^([A-Za-z_][\w-]*)\.([a-z]+)([+-][\d.]+)?$/);
  if (!m) {
    // A plain decimal, spelled out. Number() alone let two things through
    // that no author means: Number('') is 0, so the empty half of "at 3,"
    // silently placed the element on an axis origin, and Number('0x10') is
    // 16. A grammar whose stated rule is closing silent failures cannot
    // have its most basic literal be one.
    const n = Number(raw);
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw) || !Number.isFinite(n)) {
      dgErr(errors, lineNo, `${what} expects a number, an element coordinate like "x0.cy", `
        + `or a value in a plot like "roc@0.35" – got "${raw}"`);
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
// A pair that failed to parse is null, and dgParsePair has already recorded
// why with its line number. Laying out from it anyway threw a TypeError deep
// in the compiler, which reached the author as a stack trace instead of the
// sentence naming the line - `dot m at c.center` (a pair written as a single
// anchor) crashed the build rather than being reported. Placing it at the
// origin lets the layout finish so the real message gets out.
export const dgPairPx = (p, boxes, uw, uh) => (p
  ? [dgCoordPx(p[0], 'x', boxes, uw, uh), dgCoordPx(p[1], 'y', boxes, uw, uh)]
  : [0, 0]);
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
// Only a `box` draws an outline of its own. Anywhere else an outline class
// resolves, emits its CSS and changes nothing at all – a `dot` is a circle, a
// `text` has no border, a `container` is a frame around other people's boxes.
// A silent no-op is the failure this grammar keeps closing, so say which
// statement the class belongs on.
export function rejectShapeOn(kindWord, classes, lineNo, errors) {
  if (kindWord === 'box') return;
  for (const c of classes || []) {
    if (!DG_SHAPE_CLASSES.has(c)) continue;
    dgErr(errors, lineNo, `.${c} is an outline, and only a box has one to shape – `
      + `a ${kindWord} would keep its own and the class would do nothing.`);
  }
}

// The same rule as rejectShapeOn, one statement further along. `left`,
// `right`, `top` and `bottom` place a label inside the room its element gives
// it, and three kinds give it none: a container's caption is pinned to its own
// top border, a brace's label sits beside the spine on the side the brace was
// given, and an edge's label is carried at the midpoint of the line. Measured
// on the emitted SVG before this existed: `.left` moved a node label and an
// edge label and nothing else; `.top` moved a node label alone. The other five
// combinations of the two axes with the four kinds resolved, emitted their CSS
// and moved nothing.
//
// Down is the axis a container, a brace and an edge each own outright, so
// `top`/`bottom` never reach any of the three; across, an edge label really is
// anchored by the word and keeps it.
const DG_ALIGN_ACROSS = ['left', 'right'];
const DG_ALIGN_DOWN = ['top', 'bottom'];
export function rejectAlignOn(kindWord, classes, lineNo, errors) {
  const holder = kindWord === 'container' || kindWord === 'brace';
  if (!holder && kindWord !== 'edge') return;
  const why = {
    container: 'a container\'s caption sits on its own top border',
    brace: 'a brace\'s label sits beside the spine, on the side the brace was given',
    edge: 'an edge\'s label is carried at the middle of the line',
  }[kindWord];
  // On an edge all four now name a side of the line, so none of them is
  // refused here. Which pair can pick a side depends on the edge's direction,
  // and that is not known until it has been routed, so the check for naming
  // the pair that runs along the line lives in the layout instead.
  if (kindWord === 'edge') return;
  for (const c of classes || []) {
    if (!DG_ALIGN_ACROSS.includes(c) && !DG_ALIGN_DOWN.includes(c)) continue;
    dgErr(errors, lineNo, `.${c} places a label in the room its element gives it, and `
      + `${why} – the class would resolve and move nothing.`);
  }
}

// What a `bars` or a `grid` may say after its shape: a placement, like every
// other statement, plus the two or three numbers that size it. Kept in one
// reader because the two statements differ only in which numbers they accept,
// and a second copy would be the place the two drifted apart.
// Bare words a statement accepts, off a closed list – the same shape a brace's
// `bottom` already has. `series of X` says whose frame this run of columns
// belongs to; `stacked` says it piles onto what came before instead of
// standing beside it.
export const DG_BARE_OPTS = { bars: ['stacked', 'horizontal'] };
// Options whose value is a ratio, `W:H`, rather than a number. `w` and `h` are
// in *grid units*, and a grid cell is not square - at `unit=150x52` a plot
// written `w 1.9 h 1.5` lands 285px by 78px, which is nobody's idea of 1.9 by
// 1.5. `aspect` says the proportion the reader will actually see, and the
// build works the other number out.
export const DG_RATIO_OPTS = new Set(['aspect']);
// A ratio token: "4:3", "1:1", or a bare "1.5" meaning that many wide to one
// tall. Null when it is neither, so the caller can name the line.
export function dgParseRatio(tok) {
  const t = String(tok ?? '').trim();
  let m = t.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (m && +m[1] > 0 && +m[2] > 0) return +m[1] / +m[2];
  m = t.match(/^\d+(?:\.\d+)?$/);
  if (m && +t > 0) return +t;
  return null;
}
export function readGridOpts(head, id, rest0, lineNo, errors) {
  const rest = rest0.map(x => ({ v: x.v, s: x.s, e: x.e }));
  const out = { place: null, w: null, h: null, cell: null, space: null, col: null, emph: null,
    calm: null, series: null, stacked: false, horizontal: false, aspect: null, sameAs: null };
  // `space`, not `gap`. Everywhere else in this grammar `gap` is the distance
  // between two *elements*, and a placement on this very line uses it in
  // exactly that sense – so a bare `gap` here meant one thing written before
  // the placement and the other after it, with no error either way and a
  // fivefold difference in the drawing. The distance between repetitions
  // inside one statement is a different measurement and gets its own word.
  // From DG_KIND_OPTS, not spelled out again: the editor's panel and the
  // linter both read that table, and a second copy here is the one that
  // would drift.
  const allowed = DG_KIND_OPTS[head];
  let k = 0;
  while (k < rest.length) {
    const key = rest[k].v;
    if ((DG_BARE_OPTS[head] || []).includes(key)) { out[key] = true; k++; continue; }
    if (key === 'same' && head === 'bars' && rest[k + 1] && rest[k + 1].v === 'as') {
      out.sameAs = rest[k + 2] ? rest[k + 2].v : '';
      k += 3;
      continue;
    }
    if (key === 'series' && head === 'bars') {
      if (rest[k + 1] && rest[k + 1].v === 'of') { out.series = rest[k + 2] ? rest[k + 2].v : ''; k += 3; }
      else { dgErr(errors, lineNo, `bars ${id}: write "series of <chart>" – the name of the bars whose frame this belongs to`); return null; }
      continue;
    }
    if (allowed.includes(key)) {
      if (DG_RATIO_OPTS.has(key)) {
        const r = dgParseRatio(rest[k + 1]?.v);
        if (r == null) {
          dgErr(errors, lineNo, `${head} ${id}: "${key} ${rest[k + 1]?.v ?? ''}" is not a ratio – `
            + 'write it as width:height, "4:3" or "1:1", or as one number meaning that many wide to one tall');
        }
        out[key] = r;
        k += 2;
        continue;
      }
      out[key] = DG_LIST_OPTS.has(key)
        ? String(rest[k + 1]?.v ?? '').split(',').map(x => x.trim()).filter(x => x !== '')
          .map((x, i) => dgNum(x, errors, lineNo, `${head} ${id} ${key} #${i + 1}`))
        : dgNum(rest[k + 1]?.v, errors, lineNo, `${head} ${id} ${key}`);
      k += 2;
      continue;
    }
    const [place, next] = dgParsePlacement(rest, k, errors, lineNo);
    if (place) { out.place = place; k = next; continue; }
    dgErr(errors, lineNo, `unexpected "${key}" in ${head} ${id} – `
      + `this statement takes a placement${head === 'bars' ? ', "same as <chart>"' : ''} and ${allowed.join(' / ')}`);
    return null;
  }
  return out;
}

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
  rejectShapeOn(kind, attrs.classes, lineNo, errors);
  rejectAlignOn(kind, attrs.classes, lineNo, errors);
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
    // Only kinds a `default` can actually name. `bars`, `grid` and `plot`
    // have entries in the table because the option names are checked against
    // it, but they are statements rather than kinds – advising the author to
    // write `default bars` would send them at a line the parser refuses.
    const owner = [...DG_DEFAULT_KINDS].find(kk => (DG_KIND_OPTS[kk] || []).includes(key));
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

// The polyline an edge is drawn along, as a pure function of the boxes that
// are already placed. Factored out of the emitter so the *layout* can call it
// too: an edge needs a box of its own before a node may be placed against one,
// and a second copy of anchor selection and the elbow rail is the kind of
// duplication that drifts silently - one of them would keep working while the
// other stopped agreeing with it, and the disagreement would show up as a note
// sitting a few pixels off a wire.
export function dgEdgeRoute(e, classes, boxes, uw, uh) {
  const endBox = (r) => {
    if (!r.point) return boxes.get(r.ref);
    const [px, py] = dgPairPx(r.point, boxes, uw, uh);
    return { x: px, y: py, w: 0, h: 0 };
  };
  const fb0 = endBox(e.from), tb = endBox(e.to);
  if (!fb0 || !tb) return null;
  // A leader stands off the words rather than touching them. Inflating the
  // box it leaves - rather than shortening the finished line - keeps the
  // standoff correct whichever side dgAutoAnchor picks, and costs the
  // caller nothing: dgAnchorPt does the rest.
  const lg = e.lead ? DG_LEAD_GAP * uh : 0;
  const fb = lg
    ? { x: fb0.x - lg, y: fb0.y - lg, w: fb0.w + 2 * lg, h: fb0.h + 2 * lg }
    : fb0;
  const viaPx = e.via.map(p => dgPairPx(p, boxes, uw, uh));
  const towardFrom = viaPx[0] || [tb.x + tb.w / 2, tb.y + tb.h / 2];
  const towardTo = viaPx[viaPx.length - 1] || [fb.x + fb.w / 2, fb.y + fb.h / 2];
  // An elbow leaves and arrives on the axis the two ends are further apart on,
  // whatever dgAutoAnchor would have chosen from the straight line between them
  // - a parent sitting above and to the left of its child would otherwise leave
  // through its right-hand side and the rail would start off sideways. An
  // anchor the author wrote still wins.
  const has = (c) => (classes && classes.has ? classes.has(c) : false);
  const elbow = has('elbow') && !viaPx.length;
  const dxc = (tb.x + tb.w / 2) - (fb.x + fb.w / 2);
  const dyc = (tb.y + tb.h / 2) - (fb.y + fb.h / 2);
  const down = Math.abs(dyc) >= Math.abs(dxc);
  const aFrom = e.from.anchor || (elbow
    ? (down ? (dyc > 0 ? 'bottom' : 'top') : (dxc > 0 ? 'right' : 'left'))
    : dgAutoAnchor(fb, towardFrom));
  const aTo = e.to.anchor || (elbow
    ? (down ? (dyc > 0 ? 'top' : 'bottom') : (dxc > 0 ? 'left' : 'right'))
    : dgAutoAnchor(tb, towardTo));
  const start = dgAnchorPt(fb, aFrom, e.from.frac ?? 0.5);
  const end = dgAnchorPt(tb, aTo, e.to.frac ?? 0.5);
  // Halfway across the gap between the two faces, never halfway between the two
  // centres: measured from the faces, two edges out of one parent share a rail
  // and the drawing reads as one bracket.
  const rail = elbow
    ? (down ? [[start[0], (start[1] + end[1]) / 2], [end[0], (start[1] + end[1]) / 2]]
      : [[(start[0] + end[0]) / 2, start[1]], [(start[0] + end[0]) / 2, end[1]]])
    : viaPx;
  return [start, ...rail, end];
}

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
  // A tag names a set, and so does the name of a `bars`, `grid` or `plot`:
  // it is the only name the author was given for the chart, so `hide f` has
  // to take the columns with it and `emph f` has to reach them. Not for
  // `move` and `label`, which mean the frame – the members are placed against
  // its edges, so moving it moves them, and it carries no label to swap.
  const members = (id) => model.expands.get(id) || [];
  const expand = (id) => (id.startsWith('@') ? (model.tags.get(id.slice(1)) || [])
    : [id, ...members(id)]);
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
      // Whether a step said so in as many words at or before this beat. The
      // downhill visibility rule (an edge follows its ends, a holder its
      // members, a leader its subject) is a default, and this is what an
      // author overrides it with: writing the show or the hide out by name.
      visExplicit: false,
      classes: withDefaults(el),
      label: el.label,
      place: el.place || null,
      shift: [0, 0],
    });
  }
  for (const e of model.edges) {
    state.set(e.id, { visible: !shownLater.has(e.id), visExplicit: false, classes: withDefaults(e), label: e.label, place: null, shift: [0, 0] });
  }
  for (let i = 0; i < k; i++) {
    for (const op of model.steps[i].ops) {
      const whole = op.op !== 'move' && op.op !== 'label';
      const targets = (op.targets || (op.target ? [op.target] : []))
        .flatMap(whole ? expand : (id) => (id.startsWith('@') ? (model.tags.get(id.slice(1)) || []) : [id]));
      for (const id of targets) {
        const st = state.get(id);
        if (!st) continue;
        // Sticky, and deliberately so: an arrow the author showed at beat 2
        // keeps its own visibility for every beat after it. The flag is
        // rebuilt from scratch for each beat, so it means "said at or before
        // k" and clears itself for earlier ones. At the opening beat nothing
        // is explicit, so a figure with no steps inherits as it always did.
        if (op.op === 'show') { st.visible = true; st.visExplicit = true; }
        else if (op.op === 'hide') { st.visible = false; st.visExplicit = true; }
        // Which of the two set it matters at print time. `emph` and `calm`
        // are lecture-time acts and a handout should not report them; an
        // author who wrote {.dim} on an element, or restyled it with a
        // `style` step, is describing the drawing and print has to keep it.
        else if (op.op === 'emph') { st.classes.delete('dim'); st.classes.add('emph'); st.stepEmph = true; }
        else if (op.op === 'calm') { st.classes.delete('emph'); st.classes.add('dim'); st.stepEmph = true; }
        // Same slot rule as the default block: a class added by `style`
        // displaces the one already occupying its slot. Adding it alongside
        // left `tone-4 tone-1` on the element, both rules matching at equal
        // specificity, so stylesheet order decided the colour and the step
        // could silently do nothing.
        else if (op.op === 'style') for (const c of op.classes) {
          const group = DG_CLASS_GROUPS.find(g => g.includes(c));
          if (group) for (const other of group) st.classes.delete(other);
          st.classes.add(c);
          // Writing one of the two by hand takes it back from the lecture:
          // `style x {.dim}` describes the drawing, so print keeps it even if
          // an earlier `emph`/`calm` had marked the element. Without this the
          // mark never cleared and the later, deliberate class was stripped.
          if (c === 'emph' || c === 'dim') st.stepEmph = false;
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

// The same point vector, drawn as a curve through its points instead of a
// run of straight segments. Catmull-Rom converted to cubic Béziers, which is
// the interpolating spline – it passes *through* every waypoint, so an author
// who puts a point somewhere gets the curve there, and `.smooth` never moves
// a line off the thing it was attached to.
//
// Pure and stringified into the runtime beside dgShapeD, for the same reason:
// the build draws the opening beat with it and the browser draws every later
// one, and two copies of a curve routine would differ in the third decimal
// and nobody would ever see why the line twitched on the first step.
export function dgSplineD(v) {
  const n = v.length / 2;
  if (n < 3) return dgPathD(v);
  const px = (i) => v[Math.max(0, Math.min(n - 1, i)) * 2];
  const py = (i) => v[Math.max(0, Math.min(n - 1, i)) * 2 + 1];
  const r = (x) => Math.round(x * 100) / 100;
  let d = 'M' + r(px(0)) + ' ' + r(py(0));
  for (let i = 0; i < n - 1; i++) {
    // The classic uniform Catmull-Rom to Bézier conversion: the control
    // points sit a sixth of the way along the neighbours' chord.
    const c1x = px(i) + (px(i + 1) - px(i - 1)) / 6;
    const c1y = py(i) + (py(i + 1) - py(i - 1)) / 6;
    const c2x = px(i + 1) - (px(i + 2) - px(i)) / 6;
    const c2y = py(i + 1) - (py(i + 2) - py(i)) / 6;
    d += 'C' + r(c1x) + ' ' + r(c1y) + ' ' + r(c2x) + ' ' + r(c2y)
      + ' ' + r(px(i + 1)) + ' ' + r(py(i + 1));
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

// `keyword value` options an editor can find and rewrite in place. `point`
// is here for the same reason the rest are: it is written on the element's
// own line, so a control that sets it has to be able to say where it goes and
// where it would go if it were not there yet. Its value is a word rather than
// a number, which this shape does not care about.
const DG_KEYED_ATTRS = ['gap', 'frac', 'w', 'h', 'r', 'pad', 'align', 'point', 'x', 'y',
  // the options the expanding statements take on their own line
  'space', 'cell', 'step'];

// Tokens with no keyword in front of them, named so an editor can reach them
// anyway. Every one is required by its statement, so it is always present –
// there is no "where would it go if it were not there" to answer, which is
// what separates them from the keyed list above.
export const DG_POSITIONAL = ['values', 'ticks', 'xtitle', 'ytitle', 'cellkind', 'shape', 'asset'];

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
  for (const el of [...model.nodes, ...model.edges, ...model.containers, ...model.braces,
    ...(model.statements || [])]) {
    // A leader stub is deliberately absent. It carries the span of the `text`
    // statement that produced it, so handing that span out under the stub's
    // name is how an editor comes to rewrite a different element: `label`
    // resolves to the text node's label, and the literal `->` on that line
    // makes `from` resolve to whatever token happens to precede it – on
    // `text n "…" right of x gap 0.85 -> x` that is the gap. Nothing about a
    // leader is editable through the stub; it is an aspect of the statement
    // that owns it, and spanOf says so by returning null.
    if (el.lead) continue;
    // Same reason, one statement further along: a `bars`, `grid` or `plot`
    // expands into elements no line of the source declares. They carry the
    // statement's span, so handing it out under a column's name is how an
    // editor comes to rewrite the whole chart while dragging one bar. The
    // frame is the exception and keeps its span, because the frame *is* the
    // statement: moving it moves the chart, which is what the drag means.
    if (el.synth && el.synth !== el.id) continue;
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
    // An option keyword is found by its word, and the word alone is not
    // enough: `w`, `h`, `x`, `y`, `gap`, `pad` are all natural element
    // names, and nothing forbids them. On `box e "East" right of w gap 1`
    // a bare scan took the reference `w` for the width keyword and a panel
    // resize spliced the new width over the `gap` that followed it – a
    // structured edit corrupting the very line it was asked to preserve.
    // Two guards close that: the kind word and the element's own name
    // (positions 0 and 1) are never keywords, and neither is a token that
    // sits in a reference slot – right after the word that introduces one,
    // or after a comma-carrying member of an `over`/`between` list.
    const REF_INTRO = new Set(['of', 'below', 'above', 'as', 'over', 'between', '->', '<-', '--']);
    const find = (word) => toks.findIndex((x, i) => i >= 2 && !x.q && !x.attr && x.v === word
      && !(toks[i - 1] && !toks[i - 1].q && !toks[i - 1].attr
        && (REF_INTRO.has(toks[i - 1].v) || toks[i - 1].v.endsWith(','))));

    if (attr === 'line') return hit(el.span[0], el.span[1], src.slice(el.span[0], el.span[1]));

    if (attr === 'label') {
      // A `bars`, `grid` or `plot` frame has no label, and the first quoted
      // token on its line is not one either: on a `bars` it is the values, on
      // a `plot` the x axis title. Handing that back under the name `label`
      // is how a panel's label field comes to overwrite a chart's data with
      // whatever someone typed.
      if (el.frame) return null;
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
    //
    // **The braces belong to the span, not to the value.** `text` is
    // `{.a .b}` and `value` is `.a .b`, so applySpan(sp, sp.value) is not the
    // identity – the caller has to put the braces back. The absent case below
    // hands them over in prefix/suffix; the present case cannot, because they
    // are already inside the range being replaced. Getting this wrong is not
    // a small diff: the result does not parse.
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

    // ── the tokens that have no keyword ──────────────────────────────
    //
    // A `bars`'s values, a `grid`'s shape, a `plot`'s axis titles: these are
    // defined by *where* they sit on the line rather than by a word in front
    // of them, so `find(attr)` has nothing to look for. They still get names,
    // and the rule that resolves each one lives here – which keeps the whole
    // interface "ask for a name, get a span", and leaves every caller
    // unchanged.
    //
    // All of them are required by their statement, so there is no absent
    // case: a span here is either the token or null, never an insertion
    // point. That is the difference from a keyed option and the reason these
    // could not simply join the list above.
    // A bare closed word a statement accepts, with no value after it -
    // `stacked` on a series, the shape a brace's `bottom` already has. Present
    // is the token itself, so clearing it removes the word; absent is an
    // insertion before the attribute tail, so setting it adds one. That makes
    // it a checkbox at the call site rather than two branches.
    // `series of <chart>` is a keyword *pair* followed by its value, which is
    // why it fell outside DG_KEYED_ATTRS. The value is the token after `of`,
    // and it is always present - a series with no chart to join does not
    // compile - so there is no absent case to invent an insertion point for.
    // Worth having as a span rather than as a text edit: the charts in a block
    // are a closed list, and a closed list is the codebase's own criterion for
    // offering a control instead of a field.
    if (attr === 'series') {
      const bare = toks.filter(x => !x.q && !x.attr);
      const at = bare.findIndex(x => x.v === 'series');
      const val = at >= 0 && bare[at + 1] && bare[at + 1].v === 'of' ? bare[at + 2] : null;
      return val ? hit(val.s, val.e, val.v) : null;
    }
    if ((DG_BARE_OPTS[el.kind] || []).includes(attr)) {
      const at = toks.find(x => !x.q && !x.attr && x.v === attr);
      if (at) return { start: at.s, end: at.e, prefix: '', suffix: '', present: true, text: attr, value: attr };
      const ins = tailInsert(el, toks);
      return { start: ins, end: ins, prefix: ' ', suffix: '', present: false, text: '', value: '' };
    }
    if (DG_POSITIONAL.includes(attr)) {
      const quoted = toks.filter(x => x.q);
      const bare = toks.filter(x => !x.q && !x.attr);
      const one = (t) => (t ? hit(t.s, t.e, t.v) : null);
      // A quoted slot that is *not* there yet still needs a place to go, or
      // the panel can show a chart's labels and never let anyone add them.
      // The insertion carries the quotes in its prefix and suffix, which is
      // the same shape a label's absent span already had.
      const after = (t, pre = ' "', suf = '"') => (t ? gap(t.e, pre, suf) : null);
      // Quoted slots, by statement. The n-th string means a different thing
      // on each of the three, which is exactly why they are named.
      if (attr === 'values') return el.frame === 'bars' ? one(quoted[0]) : null;
      if (attr === 'ticks') {
        if (el.frame !== 'bars') return null;
        return quoted[1] ? one(quoted[1]) : after(quoted[0]);
      }
      if (attr === 'xtitle') {
        if (el.frame !== 'plot') return null;
        return quoted[0] ? one(quoted[0]) : after(bare[1]);
      }
      if (attr === 'ytitle') {
        if (el.frame !== 'plot') return null;
        if (quoted[1]) return one(quoted[1]);
        // Positional means positional: a y title with no x title in front of
        // it would be read as the x title, so writing one writes both.
        return quoted[0] ? after(quoted[0]) : after(bare[1], ' "" "');
      }
      // The one positional token that is not on an expanding statement:
      // `image <name> <asset>`, third bare token. Answered before the grid
      // rules below, or the guard there would swallow it.
      if (attr === 'asset' && el.kind === 'image' && !el.frame) return one(bare[2]);
      // `grid <name> <kind> [asset] CxR`: the kind is always the third bare
      // token, the shape is the first that looks like one, and the asset is
      // whatever sits between them.
      if (el.frame !== 'grid') return null;
      if (attr === 'cellkind') return one(bare[2]);
      const shapeAt = bare.findIndex(t => /^\d+x\d+$/.test(t.v));
      if (attr === 'shape') return shapeAt < 0 ? null : one(bare[shapeAt]);
      if (attr === 'asset') return shapeAt === 4 ? one(bare[3]) : null;
      return null;
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
//   resolveImage(ref)   -> {abs, href, remote} | {video, href} | null
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
//   resetAssets() -> optional. Called at the start of every renderDiagram,
//     so an environment that shares an asset between instances can scope the
//     sharing to one figure.
//   assetMarkup(node, id, geo, opts) -> the <svg>/<image> element for a resolved
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
      // Statements that produce no element carrying their own name. Today that
      // is exactly one: `bars … series of X`, which draws columns into a frame
      // it does not own. Every other statement leaves something in `nodes` or
      // `edges` with `id === <the name>`, and the span table keys off that -
      // so without this a series had no entry at all, and the editor could
      // select the statement, name it, and then edit nothing on it.
      statements: [],
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
      // See DG_RESERVED_IDS: these names read prototype members out of the
      // runtime's plain-object frame tables, and the failure would surface
      // at step time in the browser with nothing here to explain it.
      if (DG_RESERVED_IDS.has(id)) {
        dgErr(errors, lineNo, `"${id}" is reserved – it already names a property every JavaScript object has, `
          + `and the step runtime keys its tables by element id. Pick another name.`);
        return;
      }
      if (model.byId.has(id)) dgErr(errors, lineNo, `duplicate element id "${id}"`);
      else model.byId.set(id, kind);
    };

    // Declared plots, for dgResolvePlotCoords. Filled while the block is
    // read and consulted once at the end, which is what lets a point name a
    // plot written further down.
    const plots = new Map();

    const lines = String(body).split('\n');
    let step = null;
    let anonEdge = 0;
    // Lines a `table` has already read for itself. It is the only statement
    // that takes continuation lines other than `step`, and unlike a step it
    // has to know how many there are *before* it can place anything: the
    // frame's height is the row count. So it looks ahead, and the loop skips
    // what it consumed rather than the statement pushing elements one row at
    // a time against a frame whose size is not settled yet.
    let rowsRead = 0;
    // A chart's columns have to narrow the moment a second series joins it,
    // and the second series is written on a later line. So the series lines
    // are counted before anything is expanded – the one lookahead in this
    // parser besides a table's rows, and for the same reason: the frame's
    // geometry is a function of what comes after it.
    //
    // A series is not laid out here, only tallied. It still expands on its own
    // line, in order, through the ordinary branch below.
    const seriesOf = new Map();
    // A chart's own numbers and its own frame geometry, so a series written
    // below it can share both without the author restating either.
    const barsGeom = new Map();
    // The frame size of every chart statement, by name, recorded as its line is
    // read. `same as` on a `plot` or a `bars` is answered from here rather than
    // at layout time like a box's, and it has to be: a chart's gridlines, ticks
    // and columns are placed *at parse time* from its own w and h, so a size
    // that only arrived during layout would size the frame and leave everything
    // inside it where the old numbers put it - a silently wrong picture rather
    // than a missing one. The price is that the chart being copied has to be
    // declared first, and the error says so instead of drawing something.
    const frameSize = new Map();
    // Every chart name in the block, found before a line is expanded. Needed
    // only so the forward-reference case can say what it is: `model.byId` is
    // filled as lines are read, so at the moment a `same as` is refused the
    // chart below it has not been claimed yet and looked exactly like a name
    // that does not exist. Telling an author to declare something they can see
    // three lines down is the kind of message that wastes an afternoon.
    const chartNames = new Set();
    for (const line of lines) {
      const m = line.trim().match(/^(plot|bars)\s+([A-Za-z_][\w-]*)/);
      if (m) chartNames.add(m[2]);
    }
    const sameAsFrame = (head2, id2, name, lineNo2) => {
      const got = frameSize.get(name);
      if (got) return got;
      const kind = model.byId.get(name) || (chartNames.has(name) ? 'plot' : null);
      dgErr(errors, lineNo2, `${head2} ${id2}: "same as ${name}" `
        + (kind === 'plot' || kind === 'bars'
          ? `names a chart declared below it. A chart is sized when its own line is read, so it can only copy one it has already seen - move ${name} above ${id2}.`
          : kind
            ? `names a ${kind}, and a chart can only take its size from another chart. Give it w and h, or an aspect.`
            : `names nothing in this block.`));
      return null;
    };
    for (const line of lines) {
      const lt = line.trim();
      if (!lt.startsWith('bars')) continue;
      const st2 = dgTokenize(lt, 0);
      const plain = st2.filter(x => !x.attr && !x.q);
      const at2 = plain.findIndex(x => x.v === 'series');
      if (at2 < 0 || plain[at2 + 1]?.v !== 'of') continue;
      const owner = plain[at2 + 2]?.v;
      const q0 = st2.find(x => x.q);
      if (!owner || !q0) continue;
      const vals = q0.v.split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x));
      if (!seriesOf.has(owner)) seriesOf.set(owner, []);
      seriesOf.get(owner).push({ id: plain[1]?.v, values: vals, stacked: plain.some(x => x.v === 'stacked') });
    }
    // Where a series sits and what it stands on, for one chart. Slot 0 is the
    // chart's own columns; a plain series takes the next slot beside them, a
    // stacked one takes the slot before it and starts where that one left off.
    // The scale is the tallest stack in any slot, so a stacked chart and a
    // grouped one both fill the frame's height exactly once.
    // `aspect` says the proportion the reader sees, so it settles whichever of
    // w and h the author left out - and refuses the pair, because two ways of
    // saying the same number is two ways of saying different ones.
    const applyAspect = (head2, id2, opts2, lineNo2, defW, defH) => {
      if (opts2.aspect == null) return [opts2.w != null ? opts2.w : defW, opts2.h != null ? opts2.h : defH];
      if (opts2.w != null && opts2.h != null) {
        dgErr(errors, lineNo2, `${head2} ${id2}: "aspect" works out the height from the width, `
          + 'so giving w and h as well says the same thing twice – drop one of the three');
      }
      const [uw2, uh2] = model.unit;
      if (opts2.w != null || opts2.h == null) {
        const w2 = opts2.w != null ? opts2.w : defW;
        return [w2, (w2 * uw2 / opts2.aspect) / uh2];
      }
      return [(opts2.h * uh2 * opts2.aspect) / uw2, opts2.h];
    };
    const seriesPlan = (owner, ownValues) => {
      const runs = [{ id: owner, values: ownValues, stacked: false }, ...(seriesOf.get(owner) || [])];
      let slot = -1;
      const bases = new Map(), slots = new Map();
      const running = [];
      for (const r of runs) {
        if (!r.stacked || slot < 0) { slot++; running[slot] = []; }
        slots.set(r.id, slot);
        bases.set(r.id, r.values.map((_, i) => (running[slot][i] || 0)));
        r.values.forEach((v, i) => { running[slot][i] = (running[slot][i] || 0) + v; });
      }
      let max = 0;
      for (const col of running) for (const v of (col || [])) if (v > max) max = v;
      return { nSlots: slot + 1, bases, slots, max, runs };
    };

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
      if (n < rowsRead) continue;
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
          // Where a label sits is decided once, at emit: `text-anchor` is an
          // attribute of the element the build writes, and the runtime only
          // ever sets numbers. A step that switched `.left` on would move the
          // origin per beat while the anchor stayed put, so the label would be
          // drawn half its own width off in every other beat – silently, and
          // only on the beats the author was not looking at.
          for (const c of op.classes) {
            if (c === 'left' || c === 'right' || c === 'top' || c === 'bottom') {
              dgErr(errors, lineNo, `.${c} places the label, and where a label sits is `
                + `settled when the figure is built – a step cannot move it. `
                + `Put it on the element itself.`);
            }
          }
          // The outline is chosen when the figure is emitted, because that is
          // when the drawable kind – rect or path – is decided and written
          // into the payload. A step cannot change it, and letting the line
          // parse would leave exactly the silent no-op this grammar keeps
          // closing: the class lands, the picture does not move.
          for (const c of op.classes) {
            if (DG_SHAPE_CLASSES.has(c)) {
              dgErr(errors, lineNo, `style cannot change an outline: .${c} is fixed when the figure is `
                + 'built, so a step has nothing to switch. Put it on the element, and if two beats really '
                + 'need two outlines, draw two elements and show one at a time.');
            }
          }
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

      // ── table / lanes ────────────────────────────────────────────────
      //
      // Two more statements that expand at parse time into ordinary boxes and
      // texts, for the same reason bars, grid and plot do: nothing downstream
      // learns a new kind, so a brace spans two rows of a table and a step
      // restyles one of them with no special handling anywhere.
      //
      // What each is for, and what it is not: a `table` is a grid of labelled
      // cells, which is the one thing this grammar could not write without
      // naming every cell by hand – six rows of three cost twenty-one
      // declarations and a chain of `below` references that has to be re-aimed
      // whenever a row is inserted. `lanes` is three or four bands of equal
      // width, which containers cannot be: a container fits its members, so
      // lanes holding different numbers of things came out ragged at both ends,
      // which is the opposite of what a swimlane means.
      //
      // Neither lays anything out. A table's cells are a grid because the
      // author gave column widths and a row height; a lane's contents are still
      // placed one at a time, against `swim-1.cy` and the element before them.
      if (head === 'table' || head === 'lanes') {
        const id = t(1);
        if (!id) { dgErr(errors, lineNo, `${head} needs a name`); continue; }
        claim(id, head, lineNo);
        rejectShapeOn('box', attrs.classes, lineNo, errors);
        const qToks = toks.filter(x => x.q);
        const synth = (el) => ({ ...el, synth: id, line: lineNo, span });
        const framePlace = (place) => {
          if (place) return place;
          if (model.nodes.length === 0) return { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] };
          dgErr(errors, lineNo, `${head} ${id} has no placement (at X,Y / below … / above … / right of … / left of … )`);
          return { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] };
        };
        const squared = (cls) => (cls.some(c => c === 'round' || c === 'sharp' || DG_SHAPE_CLASSES.has(c))
          ? cls : ['sharp', ...cls]);
        const at = (xn, yn) => ({
          kind: 'abs',
          at: [{ ref: id, prop: 'left', nudge: xn }, { ref: id, prop: 'top', nudge: yn }],
        });
        // The cells of one row are one string split on a pipe, because a row
        // of a table is a sentence with three parts and reads as one. Commas
        // are already the separator inside a value list and inside a
        // coordinate, so a comma here would be the third meaning of one mark.
        const cellsOf = (str) => String(str).split('|').map(x => x.trim());
        if (!qToks[0]) {
          dgErr(errors, lineNo, head === 'table'
            ? `table ${id} needs its heading row as one string, e.g. "Attack | Layer | Countermeasure"`
            : `lanes ${id} needs its lane names as one string, e.g. "User | SOC | IT ops"`);
          continue;
        }
        const heads = cellsOf(qToks[0].v);
        const opts = readGridOpts(head, id, body0.slice(2), lineNo, errors);
        if (!opts) continue;

        if (head === 'lanes') {
          const laneH = opts.h ?? DG_LANE_H;
          const bandW = opts.w ?? DG_LANE_W;
          model.nodes.push(synth({
            kind: 'box', id, label: '', classes: ['bare', 'clear'], tags: attrs.tags,
            place: framePlace(opts.place), w: bandW, h: laneH * heads.length,
            r: null, pad: null, frame: head,
          }));
          heads.forEach((name, i) => {
            claim(dgLaneName(id, i), 'box', lineNo);
            model.nodes.push(synth({
              kind: 'box', id: dgLaneName(id, i), label: '',
              // A lane is a band to place things in, never a filled panel:
              // whatever it holds has to read over it. `.clear` is the see-
              // through interior and the author's own tail decides the rule.
              classes: squared(['clear', ...attrs.classes]), tags: attrs.tags,
              place: at(bandW / 2, laneH * i + laneH / 2),
              w: bandW, h: laneH, r: null, pad: null,
            }));
            if (!name) return;
            claim(dgLaneCapName(id, i), 'text', lineNo);
            model.nodes.push(synth({
              kind: 'text', id: dgLaneCapName(id, i), label: name,
              // Turned, because a lane is wide and short: the only room a
              // name has is along the short side. Outside the band, so it
              // never sits over anything the lane holds.
              classes: ['turn', 'small', 'muted'], tags: attrs.tags,
              place: at(-DG_LANE_CAP, laneH * i + laneH / 2),
              w: null, h: null, r: null, pad: null,
            }));
          });
          continue;
        }

        // A table's body is the run of bare quoted strings under it. Read
        // here rather than by the loop, because the frame's height is the row
        // count and the frame is placed before any cell is.
        const rows = [];
        for (let m = n + 1; m < lines.length; m++) {
          const line = lines[m].trim();
          if (!line || line.startsWith('#')) { if (!line) break; rows.push(null); continue; }
          const rt = dgTokenize(line, 0);
          if (rt.length !== 1 || !rt[0].q) break;
          rows.push({ cells: cellsOf(rt[0].v), line: m + 1 });
          rowsRead = m + 1;
        }
        const body = rows.filter(Boolean);
        const cols = opts.col && opts.col.length ? opts.col
          : heads.map(() => (opts.w != null ? opts.w / heads.length : DG_COL_W));
        if (opts.col && opts.col.length !== heads.length) {
          dgErr(errors, lineNo, `table ${id}: ${opts.col.length} width(s) in "col" for ${heads.length} `
            + 'column(s) – one number per column, separated by commas');
          continue;
        }
        for (const r of body) {
          if (r.cells.length !== heads.length) {
            dgErr(errors, r.line, `table ${id}: this row has ${r.cells.length} cell(s) and the heading `
              + `has ${heads.length} – rows are split on "|", one part per column`);
          }
        }
        const rowH = opts.h ?? DG_ROW_H;
        const space = opts.space ?? 0;
        const all = [heads, ...body.map(r => r.cells)];
        const totalW = cols.reduce((a, b) => a + b, 0) + space * (cols.length - 1);
        const totalH = all.length * rowH + space * (all.length - 1);
        model.nodes.push(synth({
          kind: 'box', id, label: '', classes: ['bare', 'clear'], tags: attrs.tags,
          place: framePlace(opts.place), w: totalW, h: totalH, r: null, pad: null, frame: head,
        }));
        const xOf = (c) => cols.slice(0, c).reduce((a, b) => a + b, 0) + space * c;
        all.forEach((cells, r) => {
          cells.forEach((text, c) => {
            if (c >= cols.length) return;
            const cid = dgCellName(id, c, r);
            claim(cid, 'box', lineNo);
            model.nodes.push(synth({
              kind: 'box', id: cid, label: text,
              // The heading is set bold and nothing else: it is the same cell
              // as every other, so a table with a tinted heading says so in
              // its own step or its own tail rather than here.
              classes: squared(r === 0 ? ['bold', ...attrs.classes] : attrs.classes.slice()),
              // Two generated tags per cell, which is what makes a row or a
              // column a one-line beat. They are ordinary tags: an author can
              // write `show @t-row-2` or `emph @t-col-0` wherever a name goes.
              // attrs.tags is absent, not empty, on a statement with no {…} tail –
              // every other site only ever passes it through.
              tags: [...(attrs.tags || []), dgRowTag(id, r), dgColTag(id, c)],
              place: at(xOf(c) + cols[c] / 2, r * (rowH + space) + rowH / 2),
              w: cols[c], h: rowH, r: null, pad: null,
            }));
          });
        });
        continue;
      }

      // ── bars / grid ──────────────────────────────────────────────────
      //
      // Both expand, here at parse time, into ordinary boxes, texts and
      // edges. Nothing downstream learns a new element kind: layout, extents,
      // the viewBox, visibility inheritance, steps, the linter and the editor
      // all keep working on the elements they already understand, and a
      // `brace over f-0,f-1,f-2` groups three columns of a chart without one
      // line of special handling anywhere.
      //
      // What makes the expansion possible at all is that an `at` may name
      // another element's coordinate: every cell is placed against the frame
      // this statement also creates, which is a real dependency edge and goes
      // through the same topological walk as everything else.
      // A cartesian frame: gridlines, ticks and axis titles, and a mapping so
      // a point can be written in the plot's own units. Like bars and grid it
      // expands into ordinary elements, so a curve through it is an ordinary
      // edge with waypoints and `.smooth`.
      //
      // Deliberately small. No log scales, no automatic tick choice, no
      // legend, no second y axis, no data series as a construct – this is a
      // frame to draw in, not a charting library growing inside a
      // boxes-and-arrows grammar.
      if (head === 'plot') {
        const id = t(1);
        if (!id) { dgErr(errors, lineNo, 'plot needs a name'); continue; }
        claim(id, 'plot', lineNo);
        const strings = toks.filter(x => x.q).map(x => x.v);
        const rest = body0.slice(2).map(x => ({ v: x.v, s: x.s, e: x.e }));
        const o = { w: null, h: null, step: null, x: null, y: null, place: null, aspect: null, sameAs: null };
        let k = 0, bad = false;
        while (k < rest.length) {
          const key = rest[k].v;
          if (key === 'aspect') {
            const r = dgParseRatio(rest[k + 1]?.v);
            if (r == null) {
              dgErr(errors, lineNo, `plot ${id}: "aspect ${rest[k + 1]?.v ?? ''}" is not a ratio – `
                + 'write it as width:height, "4:3" or "1:1", or as one number meaning that many wide to one tall');
            }
            o.aspect = r;
            k += 2;
            continue;
          }
          if (key === 'w' || key === 'h' || key === 'step') {
            o[key] = dgNum(rest[k + 1]?.v, errors, lineNo, `plot ${id} ${key}`); k += 2; continue;
          }
          if (key === 'same' && rest[k + 1]?.v === 'as') {
            o.sameAs = rest[k + 2] ? rest[k + 2].v : '';
            k += 3; continue;
          }
          if (key === 'x' || key === 'y') {
            const parts = String(rest[k + 1]?.v ?? '').split(',');
            if (parts.length !== 2) {
              dgErr(errors, lineNo, `plot ${id} ${key} expects the range as lo,hi – got "${rest[k + 1]?.v ?? ''}"`);
              bad = true;
            } else {
              o[key] = [dgNum(parts[0], errors, lineNo, `plot ${id} ${key} lo`),
                dgNum(parts[1], errors, lineNo, `plot ${id} ${key} hi`)];
            }
            k += 2; continue;
          }
          const [place, next] = dgParsePlacement(rest, k, errors, lineNo);
          if (place) { o.place = place; k = next; continue; }
          dgErr(errors, lineNo, `unexpected "${key}" in plot ${id} – `
            + 'this statement takes a placement, w, h, aspect W:H, same as <chart>, x lo,hi, y lo,hi and step');
          bad = true; break;
        }
        if (bad) continue;
        // `w` and `h` are grid units and a grid cell is not square, so a plot
        // written `w 1.9 h 1.5` at unit=150x52 lands 285px by 78px - very wide
        // and very flat, which is not what those two numbers look like on the
        // page. `aspect 4:3` or `aspect 1:1` says the proportion the reader
        // actually sees and lets the build work the other number out.
        if (o.sameAs) {
          if (o.w != null || o.h != null || o.aspect != null) {
            dgErr(errors, lineNo, `plot ${id}: "same as" takes the whole size from another chart, `
              + 'so w, h and aspect have nothing left to say – drop them or drop the "same as"');
          }
          const got = sameAsFrame('plot', id, o.sameAs, lineNo);
          if (got) { o.w = got.w; o.h = got.h; o.aspect = null; }
        }
        const [W, H] = applyAspect('plot', id, o, lineNo, 2.4, 1.8);
        const xd = o.x || [0, 1];
        const yd = o.y || [0, 1];
        const step = o.step != null ? o.step : (xd[1] - xd[0]) / 5;
        const xticks = dgPlotTicks(xd[0], xd[1], step);
        const yticks = dgPlotTicks(yd[0], yd[1], step);
        if (!xticks.length || !yticks.length) {
          dgErr(errors, lineNo, `plot ${id}: step ${step} does not divide the ranges `
            + `${xd.join(',')} and ${yd.join(',')} into whole ticks – it has to be positive, hi has `
            + 'to be above lo, and the span has to be a whole number of steps');
          continue;
        }
        if (xticks.length > DG_PLOT_MAX_TICKS || yticks.length > DG_PLOT_MAX_TICKS) {
          dgErr(errors, lineNo, `plot ${id}: ${Math.max(xticks.length, yticks.length)} ticks on one `
            + `axis – at most ${DG_PLOT_MAX_TICKS}, past which the grid is a grey field`);
          continue;
        }
        plots.set(id, { xDomain: xd, yDomain: yd, w: W, h: H });
        frameSize.set(id, { w: W, h: H });
        const synthP = (el) => ({ ...el, synth: id, line: lineNo, span });
        model.nodes.push(synthP({
          kind: 'box', id, label: '', classes: ['bare', 'clear'], tags: attrs.tags,
          place: (o.place || (model.nodes.length === 0
            ? { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] }
            : (dgErr(errors, lineNo, `plot ${id} has no placement (at X,Y / below … / right of … )`),
              { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] }))),
          w: W, h: H, r: null, pad: null, frame: head,
        }));
        const gridCls = ['muted', 'dotted', 'no-head'];
        const atP = (xn, yn) => [{ ref: id, prop: 'left', nudge: xn }, { ref: id, prop: 'top', nudge: yn }];
        xticks.forEach((v, i) => {
          const fx = ((v - xd[0]) / (xd[1] - xd[0])) * W;
          const gid = dgPlotName(id, 'gx', i);
          claim(gid, 'edge', lineNo);
          model.edges.push(synthP({
            kind: 'edge', id: gid, from: { ref: null, point: atP(fx, 0), anchor: null, frac: 0.5 },
            to: { ref: null, point: atP(fx, H), anchor: null, frac: 0.5 },
            label: '', classes: gridCls, via: [],
          }));
          const tid = dgPlotName(id, 'xt', i);
          claim(tid, 'text', lineNo);
          model.nodes.push(synthP({
            kind: 'text', id: tid, label: String(v), classes: ['small', 'muted'], tags: [],
            place: { kind: 'abs', at: atP(fx, H + 0.2) }, w: null, h: null, r: null, pad: null,
          }));
        });
        yticks.forEach((v, i) => {
          const fy = H - ((v - yd[0]) / (yd[1] - yd[0])) * H;
          const gid = dgPlotName(id, 'gy', i);
          claim(gid, 'edge', lineNo);
          model.edges.push(synthP({
            kind: 'edge', id: gid, from: { ref: null, point: atP(0, fy), anchor: null, frac: 0.5 },
            to: { ref: null, point: atP(W, fy), anchor: null, frac: 0.5 },
            label: '', classes: gridCls, via: [],
          }));
          const tid = dgPlotName(id, 'yt', i);
          claim(tid, 'text', lineNo);
          model.nodes.push(synthP({
            kind: 'text', id: tid, label: String(v), classes: ['small', 'muted', 'right'], tags: [],
            place: { kind: 'abs', at: atP(-0.12, fy) }, w: null, h: null, r: null, pad: null,
          }));
        });
        // The two axis titles are the statement's quoted strings, x first,
        // the same "first string, then second" the other statements use.
        if (strings[0]) {
          const xl = dgPlotName(id, 'xl');
          claim(xl, 'text', lineNo);
          model.nodes.push(synthP({
            kind: 'text', id: xl, label: strings[0], classes: ['small', 'bold'], tags: [],
            place: { kind: 'abs', at: atP(W / 2, H + 0.55) }, w: null, h: null, r: null, pad: null,
          }));
        }
        if (strings[1]) {
          const yl = dgPlotName(id, 'yl');
          claim(yl, 'text', lineNo);
          model.nodes.push(synthP({
            kind: 'text', id: yl, label: strings[1], classes: ['small', 'bold', 'turn'], tags: [],
            place: { kind: 'abs', at: atP(-0.62, H / 2) }, w: null, h: null, r: null, pad: null,
          }));
        }
        continue;
      }

      if (head === 'bars' || head === 'grid') {
        const id = t(1);
        if (!id) { dgErr(errors, lineNo, `${head} needs a name`); continue; }
        claim(id, head, lineNo);
        // `bars` and `plot` only ever draw boxes; a `grid` draws whatever its
        // kind word says, and an outline on a grid of dots did nothing at all.
        rejectShapeOn(head === 'grid' ? (t(2) || 'box') : 'box', attrs.classes, lineNo, errors);
        const qToks = toks.filter(x => x.q);
        // A synthetic element carries the statement's own span so an error
        // names the line that wrote it, and `synth` so anything that rewrites
        // source – the editor above all – knows there is no line of its own
        // to rewrite. Same contract the leader stub follows with `lead`.
        const synth = (el) => ({ ...el, synth: id, line: lineNo, span });
        // The same courtesy every other statement gets: the first element in a
        // block anchors the drawing at the origin, so a figure that is only a
        // chart needs no coordinates at all.
        const framePlace = (place) => {
          if (place) return place;
          if (model.nodes.length === 0) return { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] };
          dgErr(errors, lineNo, `${head} ${id} has no placement (at X,Y / below … / above … / right of … / left of … )`);
          return { kind: 'abs', implicit: true, at: [{ unit: 0 }, { unit: 0 }] };
        };
        // A column with rounded corners is not a column. The class is only
        // added where the author claimed no outline of their own, or the
        // element would carry two of one slot and stylesheet order – not the
        // author – would decide which one showed.
        const squared = (cls) => (cls.some(c => c === 'round' || c === 'sharp' || DG_SHAPE_CLASSES.has(c))
          ? cls : ['sharp', ...cls]);
        const at = (xn, yn) => ({
          kind: 'abs',
          at: [{ ref: id, prop: 'left', nudge: xn }, { ref: id, prop: 'top', nudge: yn }],
        });

        if (head === 'bars') {
          const valsTok = qToks[0];
          if (!valsTok) {
            dgErr(errors, lineNo, `bars ${id} needs its values as one string, e.g. "18,17,15,11"`);
            continue;
          }
          const values = valsTok.v.split(',').map(s => s.trim()).filter(s => s !== '')
            .map(s => dgNum(s, errors, lineNo, `bars ${id} value`));
          if (!values.length) {
            dgErr(errors, lineNo, `bars ${id}: no values in "${valsTok.v}" – expected numbers separated by commas`);
            continue;
          }
          // A column below zero would be drawn with a negative height, which
          // is not a rectangle at all: the browser skips the element and the
          // gap where it should be sits outside the frame, because the
          // viewBox was computed from a box the drawing never contained.
          // This grammar has no axis to hang a negative value off, so the
          // honest answer is to refuse it rather than to draw something.
          const below = values.findIndex(v => v < 0);
          if (below >= 0) {
            dgErr(errors, lineNo, `bars ${id}: value ${values[below]} is below zero, and a column `
              + 'is measured up from the baseline – there is nothing for it to hang from');
            continue;
          }
          const opts = readGridOpts(head, id, body0.slice(2), lineNo, errors);
          if (!opts) continue;
          // A series draws columns and nothing else: the frame, the ticks, the
          // baseline and the scale all belong to the chart it joined. Saying
          // otherwise on a series line would be a number the drawing ignores.
          const OWNED = ['w', 'h', 'space'];
          if (opts.series) {
            for (const k2 of OWNED) {
              if (opts[k2] != null) {
                dgErr(errors, lineNo, `bars ${id}: "${k2}" belongs to ${opts.series}, the chart this series `
                  + `joined – a series draws columns in a frame it does not own`);
              }
            }
            if (opts.place) {
              dgErr(errors, lineNo, `bars ${id}: a series is placed by the chart it joined, so it takes `
                + `no placement of its own – it is "series of ${opts.series}" and nothing more`);
            }
            if (qToks[1]) {
              dgErr(errors, lineNo, `bars ${id}: the tick strip belongs to ${opts.series} – one label per `
                + 'column, and a series shares its columns rather than adding any');
            }
          } else if (opts.stacked) {
            dgErr(errors, lineNo, `bars ${id}: "stacked" says what this series stands on, so it needs `
              + 'a series to stand on – write it on a "series of <chart>" line');
          }
          const owner = opts.series || id;
          const geo = opts.series ? barsGeom.get(owner) : null;
          if (opts.series && !geo) {
            dgErr(errors, lineNo, `bars ${id}: "series of ${opts.series}" names no chart above it – `
              + 'a series joins a frame, so the bars it joins have to be declared first');
            continue;
          }
          if (geo && values.length !== geo.values.length) {
            dgErr(errors, lineNo, `bars ${id}: ${values.length} value(s) against ${geo.values.length} in `
              + `${owner} – a series shares its chart's columns, so it needs one value for each`);
            continue;
          }
          const plan = seriesPlan(owner, geo ? geo.values : values);
          const max = plan.max;
          if (!(max > 0)) {
            dgErr(errors, lineNo, `bars ${id}: at least one value has to be greater than zero, `
              + 'or every column would have no height and the chart no scale');
            continue;
          }
          if (opts.series && (opts.aspect != null || opts.horizontal)) {
            dgErr(errors, lineNo, `bars ${id}: "${opts.aspect != null ? 'aspect' : 'horizontal'}" `
              + `belongs to ${opts.series}, the chart this series joined – a series draws columns `
              + 'in a frame whose shape it does not decide');
          }
          // The block's own unit, because every number below is worked out in
          // px and written back as grid units - which is what lets one
          // expansion serve both the upright and the flat reading.
          const [uw, uh] = model.unit;
          const flat = geo ? geo.flat : opts.horizontal;
          // Along the bars, and across them. Horizontal, the value runs along
          // x and the categories stack down y, so the two swap - and every
          // number below is written in those terms rather than in w and h,
          // which is what keeps one expansion serving both readings.
          if (opts.sameAs && !opts.series) {
            if (opts.w != null || opts.h != null || opts.aspect != null) {
              dgErr(errors, lineNo, `bars ${id}: "same as" takes the whole size from another chart, `
                + 'so w, h and aspect have nothing left to say – drop them or drop the "same as"');
            }
            const got = sameAsFrame('bars', id, opts.sameAs, lineNo);
            if (got) { opts.w = got.w; opts.h = got.h; opts.aspect = null; }
          } else if (opts.sameAs) {
            dgErr(errors, lineNo, `bars ${id}: a series is drawn in the frame of ${opts.series}, `
              + 'so "same as" has no size of its own to set');
          }
          const [aW, aH] = geo ? [geo.W, geo.H]
            : applyAspect('bars', id, opts, lineNo, values.length * 0.22, 1);
          const W = geo ? geo.W : aW;
          const H = geo ? geo.H : aH;
          const along = flat ? W * uw : H * uh;      // px the tallest value spans
          const across = flat ? H * uh : W * uw;     // px the categories share
          const cell = geo ? geo.cell : across / values.length;
          // `space` is the distance between two columns, in grid units – the
          // same sentence the word already is everywhere else in this grammar.
          // It was briefly a fraction of the column here, which is exactly the
          // kind of second meaning for one word this DSL keeps refusing.
          const gapU = geo ? geo.gapU : (opts.space != null ? opts.space * (flat ? uh : uw) : cell * 0.25);
          // With one series this is the whole cell less its gap, exactly what
          // it always was. With several it is that width shared out, so a
          // grouped chart occupies the same paper a single one did.
          const barW = Math.max((cell - gapU) / plan.nSlots, cell * 0.15);
          const slot = plan.slots.get(id) ?? 0;
          const base = plan.bases.get(id) || [];
          if (!opts.series) {
            barsGeom.set(id, { W, H, cell, gapU, values, flat });
            frameSize.set(id, { w: W, h: H });
            // The frame is a real box, sized and placed the way the statement
            // says, and invisible unless the author tints it. Everything else
            // hangs off its edges, so moving the statement moves the chart.
            model.nodes.push(synth({
              kind: 'box', id, label: '', classes: ['bare', 'clear'], tags: attrs.tags,
              place: framePlace(opts.place), w: W, h: H, r: null, pad: null, frame: head,
            }));
          }
          // Which columns start emphasised or pushed back. Out of range is an
          // error rather than a line that quietly marks nothing.
          const markSet = (list, word) => {
            const out = new Set();
            for (const ix of (list || [])) {
              if (!(ix >= 0 && ix < values.length)) {
                dgErr(errors, lineNo, `bars ${id}: "${word} ${ix}" names no column – `
                  + `this chart has ${values.length}, numbered 0 to ${values.length - 1}`);
                continue;
              }
              out.add(ix);
            }
            return out;
          };
          const marked = markSet(opts.emph, 'emph'), calmed = markSet(opts.calm, 'calm');
          // Placed against the frame the series belongs to, never against its
          // own name: that is the whole reason a second series needs nothing
          // but a reference to the first.
          const atOwner = (xn, yn) => ({
            kind: 'abs',
            at: [{ ref: owner, prop: 'left', nudge: xn }, { ref: owner, prop: 'top', nudge: yn }],
          });
          values.forEach((v, i) => {
            const len = (v / max) * along;                 // px
            const foot = ((base[i] || 0) / max) * along;   // px already used in this slot
            const lane = cell * i + gapU / 2 + barW * (slot + 0.5);  // px across
            claim(dgBarName(id, i), 'box', lineNo);
            model.nodes.push(synth({
              kind: 'box', id: dgBarName(id, i), label: '',
              classes: squared([...attrs.classes,
                ...(marked.has(i) ? ['emph'] : []), ...(calmed.has(i) ? ['dim'] : [])]),
              tags: attrs.tags,
              // Upright, a column grows up from the baseline, so its centre is
              // measured back from the frame's bottom. Flat, it grows right
              // from the left edge, so its centre is measured forward from
              // there - the one asymmetry between the two readings, and it is
              // the reason a horizontal chart reads at all: the eye compares
              // lengths from a shared left edge better than heights from a
              // shared floor.
              place: flat
                ? atOwner((foot + len / 2) / uw, lane / uh)
                : atOwner(lane / uw, (along - foot - len / 2) / uh),
              w: flat ? len / uw : barW / uw,
              h: flat ? barW / uh : len / uh,
              r: null, pad: null,
            }));
          });
          if (opts.series) {
            // Enough for the span table to re-tokenize the line and find the
            // values, the classes, the tags, `stacked`, `emph` and `calm`.
            // `frame` marks it a chart statement, which is what keeps a panel
            // from offering a label field: on a bars line the first quoted
            // token is the data.
            model.statements.push({
              kind: 'bars', frame: 'bars', id, series: opts.series,
              classes: attrs.classes, tags: attrs.tags, place: null,
              line: lineNo, span,
            });
            continue;
          }
          // The tick strip is one text per column, placed against the frame
          // rather than under its own column: the columns have different
          // heights and `below` would step the labels up and down with them.
          const tickTok = qToks[1];
          if (tickTok) {
            // Split on a pipe when there is one, on spaces otherwise. Spaces
            // came first and every upright chart in the tree uses them, but a
            // flat chart labels its rows with phrases - "ARP spoofing", "DNS
            // cache poisoning" - and those cannot be written at all with a
            // space-split. `|` is already the separator inside a `table` row
            // and a `lanes` name list, so it is the same mark meaning the same
            // thing rather than a third convention.
            const piped = tickTok.v.includes('|');
            const ticks = piped
              ? tickTok.v.split('|').map(x => x.trim())
              : tickTok.v.trim().split(/\s+/);
            if (ticks.length !== values.length) {
              dgErr(errors, lineNo, `bars ${id}: ${ticks.length} tick label(s) for ${values.length} `
                + `column(s) – the second string is split on ${piped ? '"|"' : 'spaces'}, `
                + 'one label per column');
            }
            ticks.forEach((tk, i) => {
              if (i >= values.length) return;
              claim(dgTickName(id, i), 'text', lineNo);
              model.nodes.push(synth({
                kind: 'text', id: dgTickName(id, i), label: tk,
                // Flat, the strip runs down the left margin and the labels are
                // right-aligned against the axis, which is the only way a
                // column of words of different lengths reads as one column.
                classes: flat ? ['small', 'muted', 'right'] : ['small', 'muted'],
                tags: attrs.tags,
                // Upright, a tick is centred under its column. Flat, the
                // strip is a *column of words*, and a column of words reads
                // only if their right edges line up - which centring cannot
                // give, because a free text is centred on its placement point
                // whatever `.right` says about the anchor. So each label is
                // placed by its own measured width: half of it, plus one
                // clearance, left of the frame's edge.
                place: flat
                  ? at(-(dgMeasure(tk, DG_FONT * 0.8, false).w / 2 + 9) / uw,
                       (cell * i + cell / 2) / uh)
                  : at((cell * i + cell / 2) / uw, H + 0.18),
                w: null, h: null, r: null, pad: null,
              }));
            });
          }
          // The baseline is what makes a row of rectangles read as a chart.
          // An author who does not want it writes `hide <name>-base`.
          claim(dgBaseName(id), 'edge', lineNo);
          model.edges.push(synth({
            kind: 'edge', id: dgBaseName(id), synth: id,
            // Upright, the baseline is the floor the columns stand on; flat,
            // it is the wall they start from. Same statement, same reason: a
            // run of rectangles reads as a chart only against a shared edge.
            from: { ref: id, anchor: flat ? 'tl' : 'bl' },
            to: { ref: id, anchor: flat ? 'bl' : 'br' },
            // In front, because it is the chart's axis and not an arrow into
            // one of the columns. Behind them it showed only in the gaps.
            label: '', classes: ['no-head', 'muted', 'front'], via: [],
          }));
          continue;
        }

        // grid: C×R cells of one size, for the pictures whose argument is
        // that you can count the exceptions. Written out by hand these are
        // longer than every other figure in a lecture put together.
        const kindWord = t(2);
        if (!DG_GRID_KINDS.has(kindWord)) {
          dgErr(errors, lineNo, `grid ${id}: expected one of ${[...DG_GRID_KINDS].join(', ')} `
            + `after the name, got "${kindWord || ''}"`);
          continue;
        }
        const isImg = kindWord === 'image';
        const src = isImg ? t(3) : null;
        if (isImg && !src) { dgErr(errors, lineNo, `grid ${id}: image needs an asset`); continue; }
        let asset = null, aspect = null;
        if (isImg) {
          asset = resolveImage(src);
          if (!asset) {
            dgErr(errors, lineNo, `grid ${id}: cannot find "${src}" – expected assets/${src}.{svg,png,jpg,…}, a path, or an https URL`);
            continue;
          }
          if (asset.video) {
            dgErr(errors, lineNo, `grid ${id}: "${asset.href}" is a clip, and a diagram draws stills – `
              + `an SVG image element cannot play video. Put the clip in the chunk body as ![](clip-id).`);
            continue;
          }
          aspect = asset.abs ? imageAspect(asset.abs) : null;
        }
        const dimsAt = isImg ? 4 : 3;
        const dims = /^(\d+)x(\d+)$/.exec(t(dimsAt) || '');
        if (!dims) {
          dgErr(errors, lineNo, `grid ${id}: expected the shape as CxR (columns by rows), got "${t(dimsAt) || ''}"`);
          continue;
        }
        const cols = +dims[1], rows = +dims[2];
        if (cols < 1 || rows < 1 || cols * rows > DG_GRID_MAX) {
          dgErr(errors, lineNo, `grid ${id}: ${cols}x${rows} is ${cols * rows} cells – `
            + `between 1 and ${DG_GRID_MAX}, above which a picture stops being countable anyway`);
          continue;
        }
        const opts = readGridOpts(head, id, body0.slice(dimsAt + 1), lineNo, errors);
        if (!opts) continue;
        // `cell` and `gap` are measured in *uh* on both axes, the same
        // decision `pad` made and for the same reason: a grid cell has to be
        // square, and one number that meant uw across and uh down would give
        // squares only where the unit happened to be square. Everything below
        // works in grid units, so the horizontal ones are converted once.
        const cellU = opts.cell != null ? opts.cell : 0.25;
        const gapU = opts.space != null ? opts.space : cellU * 0.25;
        const toX = model.unit[1] / model.unit[0];
        const cellX = cellU * toX, gapX = gapU * toX;
        const pitchX = cellX + gapX, pitchY = cellU + gapU;
        model.nodes.push(synth({
          kind: 'box', id, label: '', classes: ['bare', 'clear'], tags: attrs.tags,
          place: framePlace(opts.place), w: cols * pitchX - gapX, h: rows * pitchY - gapU,
          r: null, pad: null, frame: head,
        }));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cid = dgCellName(id, c, r);
            claim(cid, kindWord, lineNo);
            const cellNode = synth({
              kind: kindWord, id: cid, label: '', alt: '', classes: attrs.classes, tags: attrs.tags,
              place: at(c * pitchX + cellX / 2, r * pitchY + cellU / 2),
              w: kindWord === 'dot' ? null : cellX,
              h: kindWord === 'dot' ? null : cellU,
              r: kindWord === 'dot' ? cellU / 2 : null,
              pad: null,
            });
            if (isImg) { cellNode.src = src; cellNode.asset = asset; cellNode.aspect = aspect; }
            model.nodes.push(cellNode);
          }
        }
        continue;
      }

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
          else if (found.video) {
            dgErr(errors, lineNo, `image ${id}: "${found.href}" is a clip, and a diagram draws stills – `
              + `an SVG image element cannot play video. Put the clip in the chunk body as ![](clip-id).`);
          } else { node.asset = found; node.aspect = found.abs ? imageAspect(found.abs) : null; }
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
          // Which way a pointed outline aims. An option and not a class, so a
          // chevron aimed up does not need a class name of its own – and a
          // `point` on a shape with no point, or on no shape at all, is an
          // error rather than a word that sits there doing nothing.
          if (key === 'point') {
            const dir = rest[k + 1] ? rest[k + 1].v : '';
            if (!DG_POINT_DIRS.has(dir)) {
              dgErr(errors, lineNo, `${head} ${id}: point expects `
                + `${[...DG_POINT_DIRS].join(' / ')}, got "${dir}"`);
            } else {
              node.point = dir;
            }
            k += 2;
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
        rejectShapeOn(head, attrs.classes, lineNo, errors);
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
        // Only the token immediately before the arrow is an endpoint, so
        // anything earlier was being read and dropped without a word. That was
        // harmless while an edge had no options at all; it stopped being
        // harmless the moment `pad` existed, because `edge pad 0.1 a -> b`
        // then parsed, drew, and ignored the number.
        if (arrowAt > 2) {
          dgErr(errors, lineNo, `unexpected "${body0.slice(1, arrowAt - 1).map(x => x.v).join(' ')}" before the arrow `
            + 'in an edge – an edge is "edge <from> -> <to>", and its options come after the second end');
        }
        const flip = body0[arrowAt].v === '<-';
        // Whether the author named it, which is not the same question as
        // whether it has a name. An anonymous edge's `edge-3` is *positional*:
        // insert an edge above it and the name silently moves to a different
        // line. That is fine while nothing refers to it, and it stopped being
        // fine when an edge became something a coordinate can name - so anything
        // that offers to write `at edge-3.cy` has to know the difference.
        const named = !!attrs.id;
        const id = attrs.id || `edge-${++anonEdge}`;
        claim(id, 'edge', lineNo);
        rejectAlignOn('edge', attrs.classes, lineNo, errors);
        const edge = {
          kind: 'edge',
          id,
          from: dgParseRef(flip ? toTok : fromTok, errors, lineNo),
          to: dgParseRef(flip ? fromTok : toTok, errors, lineNo),
          label: quoted[0] ?? '',
          classes: attrs.classes.slice(),
          tags: attrs.tags,
          via: [], pad: null, named, line: lineNo, span,
        };
        // `--` means headless, expressed through the same class the emitter
        // already reads – but the injection is *derived from the arrow
        // token*, not authored, and `autoClasses` says so. Without the mark
        // the editor rebuilt attribute tails from `classes` and wrote
        // `.no-head` into every `--` line it touched, and its arrowheads
        // row edited a class the author never wrote instead of the token
        // that actually carries the meaning.
        if (body0[arrowAt].v === '--' && !edge.classes.includes('no-head')) {
          edge.classes.push('no-head');
          edge.autoClasses = ['no-head'];
        }
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
          // `pad` is the same sentence here it is on a box, a text, a
          // container and a brace: how far the outline sits from what it
          // encloses. On an edge what it encloses is the label's ground.
          if (body0[k].v === 'pad') {
            edge.pad = dgNum(body0[k + 1]?.v, errors, lineNo, `edge ${id} pad`);
            k++;
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
        if (edge.classes.includes('elbow') && edge.via.length) {
          dgErr(errors, lineNo, `edge ${id}: .elbow draws its own two waypoints, so it cannot `
            + `also carry "via". Drop one – .elbow for the halfway rail, "via" to say where.`);
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
        rejectShapeOn(head, attrs.classes, lineNo, errors);
        rejectAlignOn(head, attrs.classes, lineNo, errors);
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
    // `point` aims an outline, so it needs the outline – and the outline can
    // come from a `default` block declared further down the file. Checked
    // here rather than on the statement's own line for exactly that reason:
    // on the line, `default box {.chevron}` plus `point up` would have been
    // refused for having no shape to aim.
    for (const n of model.nodes) {
      if (!n.point) continue;
      const cls = new Set(n.classes);
      for (const layer of dgDefaultLayers(model, n.kind, n.tags)) {
        for (const c of layer.classes) if (DG_SHAPE_CLASSES.has(c)) cls.add(c);
      }
      const kind = dgShapeOf(cls);
      if (!DG_POINTED.has(kind)) {
        dgErr(errors, n.line, `${n.kind} ${n.id}: "point" aims an outline that has a point, and `
          + `${kind ? '.' + kind + ' has none' : 'this element has no outline'} – it applies to `
          + `${[...DG_POINTED].map(k => '.' + k).join(' and ')}`);
      }
    }

    // What each expanding statement produced, so a step naming the statement
    // can reach it. Built from `synth` rather than collected in the three
    // branches, so a fourth expanding statement gets this for nothing.
    model.expands = new Map();
    for (const el of [...model.nodes, ...model.edges]) {
      if (!el.synth || el.synth === el.id) continue;
      if (!model.expands.has(el.synth)) model.expands.set(el.synth, []);
      model.expands.get(el.synth).push(el.id);
    }

    // A plot coordinate becomes an ordinary <plot>.left+n here, before
    // anything below reads it – so the reference check, the dependency walk
    // and the layout all see the coordinate grammar this compiler has always
    // had, and none of them learns that plots exist.
    dgResolvePlotCoords(model, plots, errors);
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
        const r = (nr != null ? nr : DG_DOT_R) * uh;
        return { w: 2 * r, h: 2 * r, font: fitted(2 * r, 2 * r), padX, padY };
      }
      if (node.kind === 'image') {
        const w = (nw != null ? nw : 1) * uw;
        if (nh != null) return { w, h: nh * uh };
        if (node.aspect) return { w, h: w * node.aspect };
        // Only when the asset resolved at all: an unresolved (or refused)
        // one already has an error naming the real problem, and a warning
        // about proportions on top of it points the author the wrong way.
        if (node.asset) dgWarn(`image ${node.id}: cannot read the asset's proportions, assuming square – give it an explicit h.`);
        return { w, h: w };
      }
      const font = fitted(nw != null ? nw * uw : 0, nh != null ? nh * uh : 0);
      const m0 = dgMeasure(st.label, font, classes.has('mono'));
      // A label read bottom-to-top needs its measurements the other way round.
      // Everything below asks "how much room does the label want" and gets the
      // right answer for free once the two are swapped here.
      const m = classes.has('turn') ? { w: m0.h, h: m0.w } : m0;
      // A free `text` sizes itself to its label, and an explicit w or h says
      // otherwise – which is what a `.fit` text needs, and what `w` on a text
      // meant on paper long before it did anything.
      if (node.kind === 'text') {
        return { w: nw != null ? nw * uw : m.w, h: nh != null ? nh * uh : m.h, font, padX, padY };
      }
      // An explicit w that cannot hold its own label overflows in silence –
      // right on the machine that drew it, wrong on the projector. Say so.
      // A fitted label cannot: the size was chosen to make it fit.
      // A label there is not is a label that cannot overflow. Without this a
      // thin column of a `bars` – which carries no text at all – reported that
      // its text was about to run over the edge.
      if (st.label && nw != null && nw * uw < m.w + 6 && !classes.has('fit') && !classes.has('shrink')) {
        dgWarn(`box ${node.id} is ${nw} units wide but its label needs about `
          + `${((m.w + 2 * padX) / uw).toFixed(2)} – the text will overflow.`);
      }
      // A hexagon or a chevron has less usable interior than the rectangle
      // that bounds it: the bevel and the point are inside the box. Grow the
      // auto-computed size so the label clears them, on whichever axis the
      // point actually eats into. Only the automatic case – an explicit `w`
      // or `h` is the author's decision, and the too-narrow warning above
      // already speaks for that one.
      const outline = dgShapeName(classes, node.point);
      const boxH = nh != null ? nh * uh
        : m.h + 2 * padY + dgShapeInsetY(outline, m.h, padY);
      const inset = dgShapeInsetX(outline, boxH, m.w, padX);
      // A cross is a plus sign, and a plus with arms of two different lengths
      // is not one. Left to the general rule it came out 66 by 37 - the
      // minimum width against a height that is one line of type - which reads
      // as a shape that got stretched rather than as a marker. Squared here
      // rather than in dgShapeD, because the footprint the layout reserves has
      // to be the footprint that is drawn. An explicit w is still the author's.
      // A cross squares itself, and it does so *past an inherited width* -
      // exactly the way `squared()` in the bars expansion drops an inherited
      // outline. A `default box w 0.62` is a statement about the rectangles in
      // this block, and a plus sign is not one of them; without this, the one
      // lecture whose job is to show the class could not show it, because a
      // block-level default width cannot be unset. The element's own `w` still
      // wins, because that one is about this element.
      const squareOutline = String(outline).split(':')[0] === 'cross';
      const ownW = node.w != null ? node.w : null;
      return {
        w: squareOutline ? (ownW != null ? ownW * uw : boxH)
          : nw != null ? nw * uw
            : Math.max(m.w + 2 * padX + inset, DG_MIN_W),
        h: boxH,
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
    // An edge gets a box of its own, so a note can be placed against a wire.
    // Until now a coordinate could name a box, a dot, a text or an image and
    // never an edge - not by design, but because edges were routed after the
    // walk that places everything else. They depend only on their two ends and
    // their waypoints, all of which are already in the walk, so they belong in
    // it. A label pinned to a wire's own coordinate then survives the wire
    // moving, which is the whole promise of writing relations rather than
    // numbers, and it was the one place the promise did not hold.
    for (const e of model.edges) {
      kindOf.set(e.id, 'edge');
      const d = [];
      for (const r of [e.from, e.to]) {
        if (r.point) { for (const x of dgPairRefs(r.point)) d.push(x); }
        else if (r.ref) d.push(r.ref);
      }
      for (const p of e.via) for (const x of dgPairRefs(p)) d.push(x);
      deps.set(e.id, d);
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
    const edgeById = new Map(model.edges.map(e => [e.id, e]));
    const contById = new Map(model.containers.map(c => [c.id, c]));
    const braceById = new Map(model.braces.map(b => [b.id, b]));

    for (const id of order) {
      const st = state.get(id);
      if (edgeById.has(id)) {
        // The bounding box of the route, which is what a coordinate on an edge
        // means: `w1.cy` is the height of a horizontal wire, `w1.cx` the middle
        // of it. A zero-height box for a horizontal line is correct and not a
        // degenerate case - the line has no thickness to speak of, and
        // `above w1 gap 0.2` measures from the line itself.
        const pts = dgEdgeRoute(edgeById.get(id), st.classes, boxes, uw, uh);
        if (!pts) continue;
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        boxes.set(id, { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
        continue;
      }
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
      // An author who showed the holder by name gets the whole set fitted:
      // the other half of the same override. Without this the outline would
      // be drawn and then sized around the visible subset, which is a box
      // around part of what it says it holds.
      const memberBoxes = (state.get(id) && state.get(id).visExplicit) ? allBoxes
        : (shown.length ? shown : allBoxes);
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
    // Whose emphasis it is. `emph` and `calm` are lecture-time acts and a
    // handout should not report them; an author's own {.dim}, or one a
    // `style` step wrote, describes the drawing and print keeps it.
    const stepEmph = new Set();
    // A free `text` – and an edge's label – draws a ground only when it has a
    // tone, but a `style` step can give it one, and a geometry key present in
    // only some frames would leave the rect stranded in the others. So the
    // rect is emitted in every frame of anything that carries a tone in *any*
    // of them, and the class decides whether it paints.
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
      if (st.stepEmph) stepEmph.add(el.id);
      const variants = labelIndex.get(el.id);
      if (variants) lab.set(el.id, Math.max(0, variants.indexOf(st.label)));
      return st;
    };

    // Where the label's origin sits has to match the text-anchor it will be
    // rendered with, or the layout box and the drawn glyphs disagree: a
    // `.left` label was positioned by its centre but drawn rightwards from
    // that point, so it ran half its own width into whatever came next.
    // Every kind honours the four alignment words now. What still differs is
    // what "as far that way as it allows" measures against: a shape's inner
    // edge, and a free text's own extent, because it has no padding.
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
      // A turned label is centred on its origin whichever way it reads, so
      // `.left` / `.right` have nothing to say about it – they name an edge of
      // a horizontal run of text.
      const turned = dgTurnOf(st.classes) !== 0;
      // The padding is what "aligned" is measured against: `left` means as far
      // left as this *shape* allows, which is its inner edge and not its
      // border.
      //
      // A free `text` has neither. sizeOf gives it the bare glyph run – no
      // padding at all – so insetting it would push the label off its own box
      // by 13px, and on a `.paper` text, whose ground is drawn *outwards* from
      // that box, `.left` came out flush against the right edge of its own
      // ground. That is what the freeText flag has always been for; it was
      // dropped here and had to come back.
      const padX = freeText ? 0 : (box.padX ?? DG_PAD_X);
      const padY = freeText ? 0 : (box.padY ?? DG_PAD_Y);
      const anchor = dgLabelAnchor(st.classes);
      const x = anchor === 'start' ? box.x + padX
        : anchor === 'end' ? box.x + box.w - padX
          : box.x + box.w / 2;
      // Vertically the origin stays the *centre of the block of lines*, so the
      // emitter goes on laying them out around it and the recorded extent
      // stays symmetric about it. Moving that centre is all `top` and `bottom`
      // do – which is exactly why a bottom-aligned label of three lines puts
      // its *last* line on the inner edge rather than its first.
      // A turned label reads bottom-to-top, so the room it takes downwards is
      // its measured *width*. Using the upright height put a tall firewall bar's
      // label 13px past its own border.
      const down = turned ? m.w : m.h;
      const y = st.classes.has('top') ? box.y + padY + down / 2
        : st.classes.has('bottom') ? box.y + box.h - padY - down / 2
          : box.y + box.h / 2;
      put(el, el.id + '--l', [x, y, dgTurnOf(st.classes)]);
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
      if (node.leaderRef && !st.visExplicit) {
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
      if (!st.visExplicit && !holdsSomething(c)) vis.set(c.id, 0);
      const b = boxes.get(c.id);
      if (!b) continue;
      put(c, c.id + '--r', [b.x, b.y, b.w, b.h]);
      // A container's caption sits on its own top edge rather than inside
      // the members' space, so adding a caption never reflows the contents.
      if (st.label) {
        // Measure it, like every other label. Three of the four places that
        // position a label used to skip this, and extentsOf then fell back to
        // a hardcoded [120, 28] – so a caption of any length at all reserved
        // exactly 120px of paper beside the figure, which is where the wide
        // empty margins came from.
        const cm = dgMeasure(st.label, dgFontFor(st.classes), st.classes.has('mono'));
        ext.set(c.id + '--l', [cm.w, cm.h]);
        put(c, c.id + '--l', [b.x + 10, b.y + (b.labelH || 0) / 2 + 1, dgTurnOf(st.classes)]);
      }
    }

    for (const br of model.braces) {
      const st = record(br);
      if (!st.visExplicit && !holdsSomething(br)) vis.set(br.id, 0);
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
        put(br, br.id + '--l', [lp[0], lp[1], dgTurnOf(st.classes)]);
        // A turned label is centred on its origin whichever side it sits on,
        // so the side's own anchor no longer describes it.
        labelAnchor.set(br.id, dgTurnOf(st.classes) ? 'middle' : lanchor);
      }
    }

    for (const e of model.edges) {
      // An edge is only ever as visible as the two things it connects. An
      // arrow pointing at a box that has not appeared yet is never what the
      // author meant, and making it the rule means most edges need no `show`
      // of their own – revealing the boxes reveals the arrows between them.
      const ends = [e.from, e.to].filter(r => !r.point).map(r => state.get(r.ref));
      const st = record(e);
      if (!st.visExplicit && ends.some(s => s && !s.visible)) vis.set(e.id, 0);
      const pts = dgEdgeRoute(e, st.classes, boxes, uw, uh);
      if (!pts) continue;

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
      //
      // Not on a curve. There the points are not a run of lines at all – they
      // are where the author wants the curve to pass – and a nearly-flat
      // stretch of a ROC curve is the shape, not a slip.
      const skewCheck = !st.classes.has('smooth');
      for (let i = 1; skewCheck && i < pts.length; i++) {
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
        // dgTurnOf answers in degrees, and the test below is against a
        // boolean: `false !== 0` is true whatever the line does, so every edge
        // label used to clear its own *width*. On a horizontal edge that
        // pushed the words off by half the label's length, which is why two
        // arrows between one pair carried their labels at two heights.
        const turnDeg = dgTurnOf(st.classes);
        const turned = turnDeg !== 0;
        const vertical = Math.abs(dir[1]) > Math.abs(dir[0]);
        // The gap has to clear whatever the label measures *along the normal*,
        // which is its height beside a horizontal line and its width beside a
        // vertical one - and the other way round again when the label is
        // turned. Using the height for all four put a 90px label straddling
        // the vertical line it belonged to.
        // The measured box carries the line's leading, so half of it already
        // clears the glyphs; the constant is the visible gap on top of that.
        // At 6 the label sat about 0.7 of its own type size off the line,
        // which reads as a stray word rather than as this line's label.
        //
        // Only along the *height*, though. Measured across, a label is its
        // glyphs and nothing else, so beside a vertical line the same constant
        // bought 2px of air where beside a horizontal one it bought 3.9 - and
        // optically a gap across a line of text needs more, not less, because
        // nothing else separates the words from the rule. The missing leading
        // is added back where the measurement does not carry it.
        // A fill puts the words *on* the line and knocks the line out behind
        // them; no fill keeps them beside it. Writing a side as well as a fill
        // means both: a ground, carried clear of the line on the side named.
        // Which is why the fill alone cannot be a side of its own – a label
        // wanted on the line has nowhere else to be.
        // Only the pair lying *across* the line can pick a side; the other two
        // are warned about below and move nothing, so a fill written with one
        // of them still leaves the words on the line rather than half off it.
        const aside = (vertical ? ['left', 'right'] : ['top', 'bottom'])
          .some(c => st.classes.has(c));
        // This beat's classes, not "ever filled": a `style` step that adds a
        // tone should move the words onto the line in the same beat it paints
        // the ground under them, and both numbers are in the frame, so the
        // runtime tweens the pair as one act.
        const grounded = dgHasFill(st.classes);
        // `pad` through the same four default layers every other geometric
        // option resolves through. An edge never goes near sizeOf, which is
        // where `pick` lives, so `default edge pad 0.2` would otherwise
        // parse, sit in the model and move nothing.
        const padLayers = dgDefaultLayers(model, 'edge', e.tags).reverse();
        let ePad = e.pad;
        if (ePad == null) for (const d of padLayers) if (d.pad != null) { ePad = d.pad; break; }
        const [gx, gy] = dgPadPx(ePad, uh);
        // Beside the line, a grounded label has to clear its own *ground* and
        // not just its glyphs. Clearing the glyphs alone laid the rect back
        // across the line the label had been lifted off, which paints out the
        // one thing the offset exists to keep visible.
        const acrossGlyphs = (vertical !== turned);
        const off = (grounded && !aside) ? 0
          : (acrossGlyphs ? m.w : m.h) / 2 + 2
            + (acrossGlyphs ? font * (DG_LINE_H - 1) / 2 + 2 : 0)
            + (grounded ? (vertical ? gx : gy) : 0);
        // Which side of the line the label sits on. The offset runs along the
        // line's normal, so the pair of words that can pick a side is the pair
        // lying across the line: top/bottom on a mostly horizontal edge,
        // left/right on a mostly vertical one. The other pair would run along
        // the line and could not move the label, so it is reported instead of
        // ignored. This cannot join the parse-time gate with the other
        // alignment checks, because which pair applies is not known until the
        // edge has been routed.
        // The normal, turned so the positive side is the same side of the page
        // whichever way the edge travels. Without this a right-to-left arrow
        // put its label below the line while every left-to-right one put it
        // above, purely because of the order its two ends were named.
        let nx = dir[1];
        let ny = -dir[0];
        if (vertical ? nx < 0 : ny > 0) { nx = -nx; ny = -ny; }
        const side = vertical
          ? (st.classes.has('left') ? -1 : 1)
          : (st.classes.has('bottom') ? -1 : 1);
        for (const c of (vertical ? ['top', 'bottom'] : ['left', 'right'])) {
          if (!st.classes.has(c)) continue;
          dgWarn(`edge ${e.id}: .${c} names a direction this edge runs along, so it cannot `
            + `move the label. The edge is ${vertical ? 'vertical' : 'horizontal'} - `
            + `use ${vertical ? '.left or .right' : '.top or .bottom'}.`);
        }
        // The side is in the coordinate now, so the anchor must stay centred.
        // Left as it was, dgLabelAnchor read the same .left that chose the
        // side and shifted the text back across the line it had just cleared.
        labelAnchor.set(e.id, 'middle');
        ext.set(e.id + '--l', turned ? [m.h, m.w] : [m.w, m.h]);
        const lx = p[0] + nx * off * side, ly = p[1] + ny * off * side;
        // Through `put` like every other drawable, so extentsOf counts it: a
        // ground is wider than the glyph run it stands behind, and a frame
        // measured from the words alone clips it at the edge of a figure. It
        // goes in after the stroke and the head and before the label, which is
        // the order that puts it over the line and under the words.
        // Emitted in every frame of any edge that carries a tone in *any* of
        // them - the free text's rule - or a geometry key present in only some
        // frames leaves the rect stranded in the others. Whether it paints is
        // the class, which the stylesheet decides.
        if (grounded || styleFilled.has(e.id)) {
          const gw = turned ? m.h : m.w, gh = turned ? m.w : m.h;
          put(e, e.id + '--r', [lx - gw / 2 - gx, ly - gh / 2 - gy, gw + 2 * gx, gh + 2 * gy]);
        }
        put(e, e.id + '--l', [lx, ly, turnDeg]);
      }
    }

    return { geom, vis, cls, lab, ext, labelAnchor, fits, stepEmph };
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
    // A turned label is positioned and measured as centred on its origin –
    // `.left` / `.right` name an edge of a horizontal run of text and have
    // nothing to say about one read bottom-to-top. Drawing it anchored while
    // reserving it centred put the glyphs a full label length off the box the
    // viewBox was built from.
    // Turned wins over every other answer, including the one a container
    // caption or a brace side supplies: extentsOf reserves a turned label as
    // centred, and a drawn anchor that disagreed with the reserved one is how
    // a label ends up half outside the frame it was measured into.
    const anchor = classes.has('turn') ? 'middle'
      : anchorOverride
      || dgLabelAnchor(classes);
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
      // `standalone`: this markup is handed to the browser to re-emit an
      // image with, and the browser replaces the whole <svg> when it does. A
      // shared <symbol> would be defined in the very element being replaced,
      // so the payload has to carry the drawing itself rather than a pointer
      // at one. Without this the first commit from the editor emptied every
      // vector image in the figure and reported nothing.
      const named = assetMarkup({ ...n, alt: '\u0000ALT\u0000' }, '\u0000ID\u0000', '\u0000GEO\u0000', { standalone: true });
      const bare = assetMarkup({ ...n, alt: '' }, '\u0000ID\u0000', '\u0000GEO\u0000', { standalone: true });
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
    // One figure is one document as far as anything downstream is concerned:
    // the focus card clones it, the speaker's preview strip clones it, the
    // editor replaces it. So a <symbol> may only be shared *within* a figure –
    // shared across two, the second one breaks the moment either is moved.
    if (env.resetAssets) env.resetAssets();
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
    // Drawing order is fixed, and `.front` is the one way out of it. Read off
    // the resolved classes rather than the authored ones, so a `default edge
    // {.front}` counts too.
    const lastCls = frames[frames.length - 1].cls;
    const inFront = (e) => ` ${lastCls.get(e.id) || ''} `.includes(' front ');
    const elements = [
      ...model.containers.map(e => ({ e, kind: 'container' })),
      ...model.nodes.filter(e => e.kind === 'image').map(e => ({ e, kind: 'image' })),
      ...model.braces.map(e => ({ e, kind: 'brace' })),
      ...model.edges.filter(e => !inFront(e)).map(e => ({ e, kind: 'edge' })),
      ...model.nodes.filter(e => e.kind !== 'image').map(e => ({ e, kind: e.kind })),
      ...model.edges.filter(inFront).map(e => ({ e, kind: 'edge' })),
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
      const byStep = last.stepEmph.has(id);
      const stripped = String(last.cls.get(id) || '').split(/\s+/)
        .filter(c => c && !(byStep && (c === 'emph' || c === 'dim')));
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
    // reserve a full label width on *each* side of the origin – a box twice
    // as wide as any label can be – which is where the odd empty margins came
    // from: a figure whose outermost element was a caption reserved half that
    // caption's width of paper beyond it and then sat off-centre inside its
    // own frame. Measured on lectures/diagrams before the fix: up to 110px on
    // one side of a figure only 480px wide.
    const anchorFor = (owner, f) => {
      if (kindOf.get(owner) === 'container') return 'start';
      const explicit = (f.labelAnchor && f.labelAnchor.get(owner)) || anchorOf.get(owner);
      if (explicit) return explicit;
      return dgLabelAnchor(((f.cls && f.cls.get(owner)) || '').split(/\s+/));
    };
    const extentsOf = (f, into, visible) => {
      for (const [gid, vec] of f.geom) {
        if (visible && !visible(gid)) continue;
        if (gid.endsWith('--r') || gid.endsWith('--i')) into.push({ x: vec[0], y: vec[1], w: vec[2], h: vec[3] });
        else if (gid.endsWith('--c')) into.push({ x: vec[0] - vec[2], y: vec[1] - vec[2], w: vec[2] * 2, h: vec[2] * 2 });
        else if (gid.endsWith('--l')) {
          // A label with no measured width is a defect in this file, not
          // something an author can cause: the four places that position one
          // (labelBox, the container caption, the brace label, the edge
          // label) each record it. The fallback used to be silent, and that
          // is exactly how three of those four went years without recording
          // anything and reserved a flat 120px of paper each. Say it out loud
          // so a fifth site cannot repeat it.
          let ext2 = (f.ext && f.ext.get(gid)) || labelExt.get(gid);
          if (!ext2) {
            dgWarn(`internal: no measured width for ${gid}; the frame around this `
              + 'figure is a guess. Every place that positions a label has to record its size.');
            ext2 = [120, 28];
          }
          // A turned label occupies its own measurements the other way round,
          // and it is centred on its origin on both axes. Reserving the
          // upright box for it is not a cosmetic error: a word of any length
          // set up the side of a bar would reserve that length horizontally
          // and almost none of it vertically, so the figure would be framed
          // around a box that is nowhere near what the browser paints.
          const owner = ownerOf(gid);
          const turned = (vec[2] || 0) !== 0;
          const [lw, lh] = turned ? [ext2[1], ext2[0]] : ext2;
          const a = turned ? 'middle' : anchorFor(owner, f);
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
    // silently treats every label as centred – which under-reserves a `.right`
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
        const v = g('--r') || [0, 0, 0, 0];
        // The outline is decided once, here, from the resolved classes – and
        // that is why a `style` step may not change it: the drawable kind is
        // written into the payload at this moment, and a later frame that
        // wanted a different one would have nothing to switch. The parser
        // refuses that line rather than letting it be a silent no-op.
        const shape = kind === 'box' ? dgShapeName(st, e.point) : '';
        if (shape) {
          kinds[e.id + '--r'] = shape;
          inner += `<path id="${prefix}${e.id}--r" class="dg-shape" d="${dgShapeD(shape, v[0], v[1], v[2], v[3])}"/>`;
        } else {
          kinds[e.id + '--r'] = 'rect';
          inner += `<rect id="${prefix}${e.id}--r" x="${v[0].toFixed(2)}" y="${v[1].toFixed(2)}" width="${v[2].toFixed(2)}" height="${v[3].toFixed(2)}" rx="4"/>`;
        }
      } else if (kind === 'dot') {
        kinds[e.id + '--c'] = 'circle';
        const v = g('--c') || [0, 0, 1];
        inner += `<circle id="${prefix}${e.id}--c" cx="${v[0].toFixed(2)}" cy="${v[1].toFixed(2)}" r="${v[2].toFixed(2)}"/>`;
      } else if (kind === 'image') {
        kinds[e.id + '--i'] = 'rect';
        const v = g('--i') || [0, 0, 0, 0];
        inner += dgImageEl(e, prefix, v);
      } else if (kind === 'edge' || kind === 'brace') {
        // Like the outlines: one vector, two ways of joining it up. The
        // choice is made here, once, so a `style` step cannot change it –
        // and there is nothing a step could want from that anyway.
        const curved = kind === 'edge' && ` ${st} `.includes(' smooth ');
        const dOf = curved ? dgSplineD : dgPathD;
        kinds[e.id + '--p'] = curved ? 'spline' : 'path';
        inner += `<path id="${prefix}${e.id}--p" class="dg-stroke" d="${dOf(g('--p') || [0, 0])}" fill="none"/>`;
        for (const suffix of ['--h', '--h2']) {
          if (!printGeom.has(e.id + suffix) && !frames.some(f => f.geom.has(e.id + suffix))) continue;
          kinds[e.id + suffix] = 'path';
          const hv = g(suffix) || frames[0].geom.get(e.id + suffix) || [0, 0];
          inner += `<path id="${prefix}${e.id}${suffix}" class="dg-head" d="${dgPathD(hv)}Z"/>`;
        }
        // The ground behind an edge's label, when it has one. The same
        // drawable a free text's ground is, emitted after the line and the
        // head so it stands over them and under the words – which is the
        // whole point of giving a label a ground on a line.
        if (kind === 'edge' && frames.some(fr => fr.geom.has(e.id + '--r'))) {
          kinds[e.id + '--r'] = 'rect';
          const v = g('--r') || frames[0].geom.get(e.id + '--r') || [0, 0, 0, 0];
          inner += `<rect id="${prefix}${e.id}--r" x="${v[0].toFixed(2)}" y="${v[1].toFixed(2)}" width="${v[2].toFixed(2)}" height="${v[3].toFixed(2)}" rx="4"/>`;
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
        // The turn rides on the vector, so the opening beat is written the
        // same way every later beat is applied – see dgApplyVec.
        const turn = v[2] ? ` rotate(${v[2]})` : '';
        inner += `<g id="${prefix}${e.id}--lw${i}" data-lab="${e.id}--l" class="dg-lwrap${extra ? ' ' + extra.trim() : ''}" transform="translate(${v[0].toFixed(2)},${v[1].toFixed(2)})${turn}">`
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
