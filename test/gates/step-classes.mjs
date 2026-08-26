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
import { DG_CLASSES, DG_CLASS_KINDS, DG_STEP_FIXED, DG_STEP_FIXED_CLASSES }
  from '../../diagram-core.mjs';

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
const FIXTURE = {
  box: {
    target: 'a', spare: 'z',
    bodies: [(step) => `box a "Label" at 0,0 w 1 h 0.6\nbox z "Z" right of a gap 1\n${step}`],
  },
  edge: {
    target: 'e', spare: 'a',
    bodies: ['->', '--'].map(arrow => (step) =>
      `box a "A" at 0,0\nbox b "B" right of a gap 1\nedge e a ${arrow} b "L" via 1,1\n${step}`),
  },
  text: {
    target: 't', spare: 'a',
    bodies: [(step) => `box a "A" at 0,0\ntext t "Words" right of a gap 1 {.paper}\n${step}`],
  },
};
const KINDS = ['box', 'edge', 'text'];

// Everything the emitter writes once and the runtime never revisits.
const bakedAttrs = (svg) => [
  ...(svg.match(/font-size="[\d.]+"/g) || []),
  ...(svg.match(/text-anchor="[a-z]+"/g) || []),
].join('|');

/** What one fixture bakes about `cls`, or '' when the class is beat-local. */
function bakedIn(body, target, spare, cls) {
  const control = render(body(`step later\n  move ${spare} by 0,0`));
  const styled = render(body(`step later\n  style ${target} {.${cls}}`));
  if (!styled.ok) return 'refused';
  if (!control.ok) return 'fixture';
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
function bakedBy(kind, cls) {
  const f = FIXTURE[kind];
  for (const body of f.bodies) {
    const why = bakedIn(body, f.target, f.spare, cls);
    if (why) return why;
  }
  return '';
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
  let checked = 0;
  for (const cls of [...DG_CLASSES].sort()) {
    if (DG_STEP_FIXED_CLASSES.has(cls)) continue;
    const kind = KINDS.find(k => (DG_CLASS_KINDS[cls] || []).includes(k));
    if (!kind) continue;
    checked++;
    const why = bakedBy(kind, cls);
    const what = `.${cls} survives a style step on ${kind === 'edge' ? 'an' : 'a'} ${kind}`;
    if (cls in PENDING) { pendingOk(why === '', what, PENDING[cls]); continue; }
    ok(why === '', what, why === 'refused'
      ? 'the compiler refuses it although DG_STEP_FIXED does not name it'
      : `it bakes ${why}`);
  }
  note(`${DG_STEP_FIXED_CLASSES.size} class(es) the table fixes · ${checked} it does not`);
}
