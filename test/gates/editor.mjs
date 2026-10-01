/*
 * The editor's source edits, without a browser.
 *
 * `editor.mjs` is a classic script spliced into the live views, so it cannot
 * be imported – but nearly everything it does to a figure is a function from
 * one block body to another, decided by the compiler and the span table. This
 * gate loads the file as text into a `vm` context with `window.PSI_DG` set to
 * `diagram-core.mjs` and a DOM that answers every lookup with nothing, opens a
 * figure by hand, and drives the acts that rewrite source: rename, delete,
 * duplicate, copy and paste, the step pane's ops, a resize. Each case is a
 * defect the pre-2.0.0 review reproduced this way, so each assertion reads as
 * the behaviour that replaced it.
 *
 * What it cannot see is anything drawn – a guide, a chip, the canvas. Those
 * stay in the `editor-*` browser specs.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './harness.mjs';
import * as CORE from '../../diagram-core.mjs';

export const name = 'the editor rewrites a figure\'s source the way its acts say';

// A DOM that is never there. Every lookup answers null and every element the
// editor builds is an inert object, which is enough: with `DGE.open` false the
// editor paints nothing, and the functions under test only read and write
// `DGE.source`.
function inert() {
  const el = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild(k) { return k; },
    replaceChildren() {}, addEventListener() {}, removeEventListener() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    set innerHTML(v) {}, get innerHTML() { return ''; }, textContent: '',
  };
  return el;
}

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

/**
 * A fresh editor with one figure open on `body`. `lecture` is what the build
 * passes as `window.PSI_DG_LECTURE`; `confirm` answers `window.confirm`.
 */
export function loadEditor({ lecture = 'gate', confirm = true, storage } = {}) {
  const text = fs.readFileSync(path.join(ROOT, 'editor.mjs'), 'utf8');
  const document = {
    readyState: 'loading',
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    createElement: inert, createElementNS: inert, createTextNode: inert,
    body: inert(), documentElement: inert(),
  };
  const ctx = {
    document, console,
    localStorage: storage || memoryStorage(),
    sessionStorage: memoryStorage(),
    navigator: {},
    confirm: () => confirm,
    setTimeout, clearTimeout, requestAnimationFrame: () => 0,
    // The page half of an edit: no page here, so nothing to swap.
    dgSwapFigure: () => null,
  };
  ctx.window = ctx;
  ctx.PSI_DG = CORE;
  ctx.PSI_DG_DEFAULTS = '';
  ctx.PSI_DG_LECTURE = lecture;
  vm.createContext(ctx);
  vm.runInContext(text + '\n;globalThis.__E = { DGE, dgeCompilerFor, dgeRecompile };', ctx);
  const E = ctx.__E;
  const run = (src) => vm.runInContext(src, ctx);
  return {
    ctx, run,
    open(body, extra = {}) {
      const fig = { body, attrs: '', chunk: 'fx', nth: 1, images: {}, compiler: E.dgeCompilerFor({}), ...extra };
      E.DGE.fig = fig;
      E.DGE.source = body;
      E.DGE.beat = 0;
      E.DGE.selection = [];
      E.DGE.undo = []; E.DGE.redo = [];
      E.dgeRecompile();
      if (E.DGE.problems.length) throw new Error('fixture does not compile: ' + E.DGE.problems[0].msg);
      return fig;
    },
    get DGE() { return E.DGE; },
  };
}

export async function run({ report }) {
  const { ok } = report;
  const ed = loadEditor();
  const sel = (ids) => { ed.DGE.selection = ids; };
  const src = () => ed.DGE.source;
  const note = () => ed.DGE.status.note;
  const compiles = () => !ed.DGE.problems.length;

  // ── renaming (S6.1) ──────────────────────────────────────────────
  ed.open('box a "A"\nbars a-b "1,2,3" right of a\nstep s\nemph a-b-0');
  ed.run('dgeRename("a", "c")');
  ok(src() === 'box c "A"\nbars a-b "1,2,3" right of c\nstep s\nemph a-b-0',
    'renaming a leaves the names a sibling `bars a-b` generates alone', JSON.stringify(src()));

  ed.open('box a "A"\nbox b "B" right of a\nstep a\nshow b');
  ed.run('dgeRename("a", "c")');
  ok(src() === 'box c "A"\nbox b "B" right of c\nstep a\nshow b',
    'a step named like the element keeps its name', JSON.stringify(src()));

  for (const [word, body, want] of [
    ['w', 'box w "W"\nbox b "B" right of w w 2', 'box c "W"\nbox b "B" right of c w 2'],
    ['at', 'box at "W"\nbox b "B" at 3,2\nbox d "D" right of at', 'box c "W"\nbox b "B" at 3,2\nbox d "D" right of c'],
    ['left', 'box left "L"\nbox b "B" left of left', 'box c "L"\nbox b "B" left of c'],
  ]) {
    ed.open(body);
    ed.run(`dgeRename(${JSON.stringify(word)}, "c")`);
    ok(compiles() && src() === want, `an element called \`${word}\` can be renamed, and the keyword \`${word}\` stays`,
      JSON.stringify(src()) + ' · ' + note());
  }

  ed.open('sequence s\nactor u "U"\nactor v "V"\nu -> v "hi"');
  ed.run('dgeRename("u", "w2")');
  ok(src() === 'sequence s\nactor w2 "U"\nactor v "V"\nw2 -> v "hi"',
    'an actor is renamed in the messages that name it', JSON.stringify(src()));

  // ── resizing `same w as` (S6.2) ──────────────────────────────────
  const resize = (id, handle) => ed.run(`(() => {
    const ctx = dgeGestureBase();
    const plan = dgePlanResize(ctx, ${JSON.stringify(id)}, 0.5, 0.5, ${JSON.stringify(handle)});
    const next = dgeApplyEdits(ctx, ${JSON.stringify(id)}, plan.edits);
    dgeGestureEnd();
    return dgeSetSource(next);
  })()`);
  ed.open('box a "A" w 2\nbox b "B" right of a same w as a');
  ok(resize('b', 'e') && src() === 'box a "A" w 2\nbox b "B" right of a w 2.5',
    'an east drag on `same w as a` writes a width and drops the relation', JSON.stringify(src()));
  ed.open('box a "A" w 2\nbox b "B" right of a same w as a h 1');
  ok(resize('b', 's') && src() === 'box a "A" w 2\nbox b "B" right of a same w as a h 1.5',
    'a south drag on the same box keeps `same w as a`', JSON.stringify(src()));
  ed.open('box a "A" w 2\nbox b "B" right of a same w as a');
  {
    const sp = ed.DGE.spans.spanOf('b', 'w');
    ok(sp && !sp.present, 'the `w` in `same w as` is not the width keyword', JSON.stringify(sp));
    const sw = ed.DGE.spans.spanOf('b', 'same-w-as');
    ok(sw && sw.present && sw.value === 'a', 'spanOf answers `same-w-as` with its element', JSON.stringify(sw));
    const sa = ed.DGE.spans.spanOf('b', 'same-as');
    ok(sa && !sa.present, '`same-as` does not answer for `same w as`', JSON.stringify(sa));
  }

  // ── paste in place with the figure's first element (S6.3) ─────────
  ed.open('box a "A"\nbox b "B" right of a');
  const boxA = { ...ed.DGE.boxes.get('a') };
  sel(['a', 'b']); ed.run('dgeCopy()');
  let clip = ed.DGE.clipboard;
  ed.open('box p "P"\nbox q "Q" below p');
  ed.DGE.clipboard = clip;
  ed.run('dgePaste(true)');
  {
    const got = ed.DGE.boxes.get('a');
    ok(compiles() && /\nbox a "A" at [\d.-]+,[\d.-]+\nbox b "B" right of a$/.test(src())
      && got && Math.abs(got.x - boxA.x) < 1 && Math.abs(got.y - boxA.y) < 1,
    'paste in place gives the first element the `at` it was drawn at', JSON.stringify(src()));
  }

  // ── a refused act says so, and only so (S6.4) ────────────────────
  ed.open('box a "A"\nstep s\nshow a');
  ed.DGE.beat = 1;
  ed.run('dgeAddStepOp("show", ["nope"])');
  ok(/^not applied/.test(note()), 'a refused step op is reported as refused', note());
  {
    // Delete and paste refuse through the same door. Nothing they write is
    // refused any more, so the door is made to refuse.
    const real = ed.ctx.dgeSetSource;
    ed.ctx.dgeSetSource = () => { ed.ctx.dgeStatus('', 'not applied · forced', true); return false; };
    ed.open('box a "A"\nbox b "B" below a');
    sel(['b']); ed.run('dgeDelete()');
    ok(note() === 'not applied · forced', 'a refused delete is not reported as deleted', note());
    sel(['a']); ed.run('dgeCopy()'); ed.run('dgePaste(false)');
    ok(note() === 'not applied · forced', 'a refused paste is not reported as pasted', note());
    ed.ctx.dgeSetSource = real;
  }

  // ── deleting a chain (S6.5) ───────────────────────────────────────
  ed.open('box z "Z"\nbox a "A" right of z\nbox b "B" right of a\nbox c "C" right of b\nbox d "D" below z');
  sel(['a']); ed.run('dgeDelete()');
  ok(src() === 'box z "Z"\nbox d "D" below z',
    'deleting a takes b, which stood on it, and c, which stood on b', JSON.stringify(src()));

  // ── multi-line statements (S6.6) ──────────────────────────────────
  const T = 'box x "X"\ntable t "H | I" below x\n  "a | b"\n  "c | d"\nbox y "Y" below x';
  ed.open(T); sel(['t']); ed.run('dgeDelete()');
  ok(src() === 'box x "X"\nbox y "Y" below x', 'deleting a table takes its rows', JSON.stringify(src()));
  ed.open(T); sel(['t']); ed.run('dgeDuplicate()');
  ok(compiles() && src() === T + '\ntable t2 "H | I" below x\n  "a | b"\n  "c | d"',
    'duplicating a table brings its rows', JSON.stringify(src()));
  const S = 'box x "X"\nsequence s below x\n  actor u "U"\n  actor v "V"\n  u -> v "hi"\nbox y "Y" right of x';
  ed.open(S); sel(['s']); ed.run('dgeDelete()');
  ok(src() === 'box x "X"\nbox y "Y" right of x', 'deleting a sequence takes its run', JSON.stringify(src()));
  ed.open(S); sel(['s']); ed.run('dgeDuplicate()');
  ok(compiles() && src() === S + '\nsequence s2 below x\n  actor u2 "U"\n  actor v2 "V"\n  u2 -> v2 "hi"',
    'duplicating a sequence brings its run, its actors renamed', JSON.stringify(src()));
  ed.open(S); sel(['s']); ed.run('dgeCopy()'); ed.run('dgePaste(false)');
  ok(compiles() && /\nsequence s2 below x2\n {2}actor u2 "U"\n {2}actor v2 "V"\n {2}u2 -> v2 "hi"$/.test(src()),
    'a sequence copies and pastes whole', JSON.stringify(src()));
  ed.open('box x "X"\ntable t "H | I" below x\n  "a | b"\nedge e t-0-0.bottom -- t-1-0.bottom');
  sel(['e']); ed.run('dgeCopy()'); ed.run('dgePaste(false)');
  ok(compiles() && /\nedge e2 t2-0-0\.bottom -- t2-1-0\.bottom$/.test(src()),
    'a generated name on the clipboard follows its renamed maker', JSON.stringify(src()));

  // ── a paste's fresh names are fresh from each other (S6.7) ────────
  ed.open('box a "A"\nbox a2 "A2" right of a');
  sel(['a', 'a2']); ed.run('dgeCopy()');
  clip = ed.DGE.clipboard;
  ed.open('box a "X"\nbox z "Z" right of a');
  ed.DGE.clipboard = clip;
  ed.run('dgePaste(false)');
  ok(compiles() && /\nbox a3 "A" at [\d.-]+,[\d.-]+\nbox a2 "A2" right of a3$/.test(src()),
    'pasting `a` and `a2` where `a` exists renames `a` past `a2`', JSON.stringify(src()));

  // ── the reader's shelf is per lecture (S2.3) ──────────────────────
  {
    const store = (() => {
      const m = new Map();
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k), keys: () => [...m.keys()] };
    })();
    const one = loadEditor({ lecture: 'lecture-a', storage: store });
    one.open('box a "A"', { chunk: 'fig' });
    one.run('dgeRename("a", "c")');
    const two = loadEditor({ lecture: 'lecture-b', storage: store });
    const fig = two.open('box a "A"', { chunk: 'fig' });
    ok(store.keys().length === 1 && store.keys()[0] === 'psi-diagram:v1:lecture-a:fig#1',
      'a kept edit is filed under its lecture', JSON.stringify(store.keys()));
    ok(two.run('dgeLoadLocal')(fig) === null, 'another lecture\'s figure of the same id does not see it');
  }
}
