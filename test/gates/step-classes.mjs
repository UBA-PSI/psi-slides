/*
 * A `style` step can only change what a beat can carry.
 *
 * The static SVG *is* the last beat, and the runtime revisits exactly two
 * things per beat: the class string, and the numeric geometry vectors for the
 * keys present in that beat's `geom` map (`dgRenderInto` iterates
 * `for (const key in frame.geom)` – a key a frame does not mention is simply
 * never touched). So a class is beat-local exactly when its whole effect lives
 * in those two. Anything the emitter writes once – a font size, a text anchor,
 * which element tag is drawn, whether a second arrowhead exists at all – is
 * settled for the whole figure, and the beats that are supposed not to have
 * the class are drawn with it anyway. That failure is silent: the figure
 * compiles, prints correctly, and is wrong only while somebody is presenting.
 *
 * `DG_STEP_FIXED` in `diagram-core.mjs` is the compiler's own answer to which
 * classes those are. This gate does not restate that table – it *derives* both
 * of its expectations from it, so the two cannot drift:
 *
 *   - every class the table names is refused in a step, in both signs;
 *   - every class the table does not name is accepted in a step, and is
 *     genuinely beat-local by the test above.
 *
 * The second half is what makes the table falsifiable. A class missing from it
 * shows up here as an accepted step that bakes something, which is exactly the
 * defect the table exists to prevent.
 */
import { render, frames } from './harness.mjs';
import { DG_CLASSES, DG_CLASS_KINDS, DG_STEP_FIXED, DG_STEP_FIXED_CLASSES, DG_HEAD_CLASSES,
  DG_CLASS_GROUPS } from '../../diagram-core.mjs';

export const name = 'a style step only carries beat-local classes';

// One fixture per kind a class can sit on, each with a spare element so the
// control can carry a no-op `move`. The payload only exists when a figure has
// a step at all, so a control with no step would differ from every styled
// figure by the whole payload and nothing would look beat-local.
//
// The edge has two, one headed and one not, because a class is only tested by
// a figure that does not already carry it: against a `->` base `.one-head`
// changes nothing and would pass whatever it does, and against a `--` base
// `.no-head` would. Every class is measured on both and judged by the worse
// answer.
//
// Each body takes the step *and* a base class to write on the target's own
// line, because the two signs need opposite starting points: a class is only
// tested by a figure that does not already carry it, and a *removal* is only
// tested by one that does.
// The base *displaces* a class of the fixture's own that answers the same
// question, rather than joining it: two classes from one slot in one tail is
// an error, so a text written `{.paper}` and handed a base of `.tone-1` would
// be refused by the grammar and the gate would report a fixture as a defect.
const slotOf = (cls) => DG_CLASS_GROUPS.find(g => g.includes(cls.replace(/^\./, '')));
const tail = (own, base) => {
  const slot = base ? slotOf(base) : null;
  const kept = slot ? own.filter(c => !slot.includes(c.replace(/^\./, ''))) : own;
  const parts = [...kept, ...(base ? [base] : [])];
  return parts.length ? ` {${parts.join(' ')}}` : '';
};
const FIXTURE = {
  box: {
    target: 'a', spare: 'z',
    bodies: [(step, base) =>
      `box a "Label" at 0,0 w 1 h 0.6${tail([], base)}\nbox z "Z" right of a gap 1\n${step}`],
  },
  edge: {
    target: 'e', spare: 'a',
    // A third body with no waypoints, because `.elbow` and `via` on one line
    // are an error – so a base of `.elbow` can only be written on an edge
    // that has none, and without this body the removal of an elbow could not
    // be measured at all.
    bodies: [...['->', '--'].map(arrow => (step, base) =>
      `box a "A" at 0,0\nbox b "B" right of a gap 1\n`
      + `edge e a ${arrow} b "L" via 1,1${tail([], base)}\n${step}`),
    (step, base) => `box a "A" at 0,0\nbox b "B" right of a gap 1\n`
      + `edge e a -> b "L"${tail([], base)}\n${step}`],
  },
  text: {
    target: 't', spare: 'a',
    bodies: [(step, base) =>
      `box a "A" at 0,0\ntext t "Words" right of a gap 1${tail(['.paper'], base)}\n${step}`],
  },
};
const KINDS = ['box', 'edge', 'text'];

// What a removal has to be removing. A class the element already carries -
// except a head class, which item 13 refuses in a tail outright: there the
// arrow token *is* the base, so the `->` body already carries `.one-head` and
// the `--` body `.no-head`, and only `!both-heads` is left with nothing to
// take away.
const baseFor = (cls) => (DG_HEAD_CLASSES.includes(cls) ? '' : `.${cls}`);

// Everything the emitter writes once and the runtime never revisits.
const bakedAttrs = (svg) => [
  ...(svg.match(/font-size="[\d.]+"/g) || []),
  ...(svg.match(/text-anchor="[a-z]+"/g) || []),
].join('|');

/** What one fixture bakes about `cls`, or '' when the class is beat-local. */
function bakedIn(body, target, spare, cls, sign = '.') {
  const base = sign === '!' ? baseFor(cls) : '';
  const control = render(body(`step later\n  move ${spare} by 0,0`, base));
  // The control carries the base and an inert step, so a control the compiler
  // refuses means the *base* cannot be written on this fixture – `.elbow`
  // beside a `via`, say. That is a fixture saying "not here", not a defect,
  // and it is answered before the styled figure is judged so the two can
  // never be confused.
  if (!control.ok) return 'base';
  const styled = render(body(`step later\n  style ${target} {${sign}${cls}}`, base));
  if (!styled.ok) return 'refused';
  const a = frames(control.out), b = frames(styled.out);
  if (!a || !b) return 'payload';
  // A geometry key present in one beat and absent in another is a drawable the
  // runtime cannot take away again.
  const keys = b.frames.map(fr => Object.keys(fr.geom).sort().join(' '));
  if (new Set(keys).size > 1) return 'the set of drawables';
  // `kinds` is figure-level, so a class that changes which *tag* is drawn gives
  // one answer for every beat - that is `.smooth`, which turns `e--p` from a
  // path into a spline.
  //
  // Only a **changed value** counts. An *added* key is not a bake: an edge whose
  // heads a step touches carries both head drawables in every frame, collapsed
  // to a point where the beat does not want one, so `kinds` legitimately holds
  // one entry the control figure has no need of. Comparing the two maps whole
  // reported that as baking the drawable kind, which is the same artefact that
  // made an earlier hand-rolled sweep call every class emit-once: it was
  // comparing two different figures rather than one figure against itself.
  for (const k of Object.keys(b.kinds)) {
    if (k in a.kinds && a.kinds[k] !== b.kinds[k]) return 'the drawable kind';
  }
  if (bakedAttrs(control.print) !== bakedAttrs(styled.print)) return 'a typeset attribute';
  return '';
}

/** The worst answer across the kind's fixtures, or '' when all are clean. */
function bakedBy(kind, cls, sign = '.') {
  const f = FIXTURE[kind];
  let tested = 0;
  for (const body of f.bodies) {
    const why = bakedIn(body, f.target, f.spare, cls, sign);
    if (why === 'base') continue;
    tested++;
    if (why) return why;
  }
  // Every body refused the base: nothing was measured, and saying so is the
  // difference between a gate with a hole in it and a gate that passes.
  return tested ? '' : 'base';
}

// Known gaps: the assertion reads as it should once the gap is closed, so an
// entry fails the day it is fixed and somebody deletes it.
const PENDING = {
  // Empty on purpose, and the shape stays. An entry here is a defect written as
  // the assertion that should hold once it is fixed, so the gate reports it and
  // does not fail - and starts failing the day it passes, which is what stops a
  // ledger from rotting.
  //
  // The three that were here were the arrowhead slot, and they were right: a
  // step that changed a head added or removed a geometry key, the static SVG is
  // the last beat, and the runtime only visits keys a frame mentions - so the
  // other beats drew a head that was not theirs. Fixed by emitting the head in
  // every frame of any edge whose heads a step touches and collapsing it to its
  // own tip where it is not wanted, which is the rule the edge label's ground
  // already followed. `vis` could not have answered it: `vis` is keyed by
  // element, and a head is one drawable inside an edge's group.
};


export async function run({ report }) {
  const { ok, pendingOk, note } = report;

  // ── the table's own claim: these are refused, both signs ──────────
  for (const [what, list] of Object.entries(DG_STEP_FIXED)) {
    for (const cls of list) {
      const kind = KINDS.find(k => (DG_CLASS_KINDS[cls] || []).includes(k));
      if (!kind) { note(`${cls}: no fixture kind accepts it, skipped`); continue; }
      const f = FIXTURE[kind];
      const add = render(f.bodies[0](`step later\n  style ${f.target} {.${cls}}`));
      const rm = render(f.bodies[0](`step later\n  style ${f.target} {!${cls}}`));
      ok(!add.ok && !rm.ok, `a step refuses .${cls} and !${cls} (it sets ${what})`,
        `.${cls} ${add.ok ? 'accepted' : 'refused'}, !${cls} ${rm.ok ? 'accepted' : 'refused'}`);
    }
  }

  // ── the converse: everything else is accepted and is beat-local ───
  // On *every* kind the class can reach, in *both* signs. Taking the first
  // compatible kind and the positive sign alone is enough to falsify the
  // table, which is what this half is for – but it is not the claim the
  // closure made, and the two the narrow version could not have seen are the
  // two the grammar keeps getting wrong: a class that reaches two kinds
  // through different drawables, and a removal that is not the mirror of its
  // addition.
  let checked = 0, pairs = 0;
  for (const cls of [...DG_CLASSES].sort()) {
    if (DG_STEP_FIXED_CLASSES.has(cls)) continue;
    const kinds = KINDS.filter(k => (DG_CLASS_KINDS[cls] || []).includes(k));
    if (!kinds.length) continue;
    checked++;
    for (const kind of kinds) {
      for (const sign of ['.', '!']) {
        pairs++;
        const why = bakedBy(kind, cls, sign);
        const what = `${sign}${cls} survives a style step on ${kind === 'edge' ? 'an' : 'a'} ${kind}`;
        if (why === 'base') { pairs--; note(`${what}: no fixture can carry the base, not measured`); continue; }
        if (cls in PENDING) { pendingOk(why === '', what, PENDING[cls]); continue; }
        ok(why === '', what, why === 'refused'
          ? 'the compiler refuses it although DG_STEP_FIXED does not name it'
          : `it bakes ${why}`);
      }
    }
  }
  note(`${DG_STEP_FIXED_CLASSES.size} class(es) the table fixes · ${checked} it does not, `
    + `over ${pairs} kind-and-sign combination(s)`);
}
