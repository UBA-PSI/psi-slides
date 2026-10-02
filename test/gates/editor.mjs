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

  // ── an element called `same` (R1) ─────────────────────────────────
  ed.open('box same "S" at 0,0\nbox b "B" right of same w 2');
  ok(resize('b', 'e') && src() === 'box same "S" at 0,0\nbox b "B" right of same w 2.5',
    'a `w` after a reference to an element called `same` is the width keyword', JSON.stringify(src()));

  // ── a message's positional id follows its sequence on paste (R2) ──
  ed.open('sequence s\n  actor u "U"\n  actor v "V"\n  u -> v "hi"\n  v -> u "ho"\nbrace b over s-1 side right "x"');
  sel(['b']); ed.run('dgeCopy()'); ed.run('dgePaste(false)');
  ok(compiles() && /\nbrace b2 over s2-1 side right "x"$/.test(src()),
    'a pasted brace over `s-1` points at the pasted sequence\'s `s2-1`', JSON.stringify(src()) + ' · ' + note());

  // ── a delete sees every reference (R3) ────────────────────────────
  {
    let asked = '';
    ed.ctx.confirm = (m) => { asked = m; return true; };
    const body = fs.readFileSync(path.join(ROOT, 'lectures/diagrams/source.md'), 'utf8');
    const at = body.indexOf('{.full #table}');
    const open = body.indexOf('\n', body.indexOf('::: draw', at)) + 1;
    ed.open(body.slice(open, body.indexOf('\n:::', open)));
    sel(['t']); ed.run('dgeDelete()');
    const code = src().split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    ok(compiles() && !/\bt[-.]|@t-/.test(code) && /^step link-layer$/m.test(code),
      'deleting the table of #table takes the rule drawn between its coordinates and every '
      + '`style @t-row-N` – and keeps the steps', JSON.stringify(src()) + ' · ' + note());
    ed.open('box a "A"\nbox c "C" right of a gap 2\nbox t "T" below a\nedge e a -> c via t.right,a.cy\n'
      + 'step s\n  move c to right of t');
    sel(['t']); ed.run('dgeDelete()');
    ok(compiles() && src() === 'box a "A"\nbox c "C" right of a gap 2\nstep s',
      'a waypoint on it and a step moving something against it go with it', JSON.stringify(src()));

    // ── a member list loses a member (R4) ───────────────────────────
    ed.open('box a "A"\nbox b "B" right of a\nbox d "D" right of b gap 2\n'
      + 'brace br over a,b,d side bottom "x"\nbox z "Z" below br\nstep s\n  show a, b');
    sel(['b']); ed.run('dgeDelete()');
    ok(compiles() && src() === 'box a "A"\nbrace br over a side bottom "x"\nbox z "Z" below br\nstep s\n  show a',
    'deleting b takes d, which stands on it, and keeps the brace and the step with a alone in them',
    JSON.stringify(src()));
    ok(/stay, with what goes taken out of their list:\nline 4: brace br holds b – a,b,d becomes a/.test(asked)
      && /line 3: box d is placed against b/.test(asked),
    'the confirmation says which lines go and which only lose a member', JSON.stringify(asked));
    ed.open('box a "A"\nbox b "B" right of a gap 2\nbox q "Q" below a\nbrace br over b side bottom "x"\n'
      + 'box z "Z" below br');
    sel(['b']); ed.run('dgeDelete()');
    ok(compiles() && src() === 'box a "A"\nbox q "Q" below a',
      'a brace left holding nothing goes, and what stood on it', JSON.stringify(src()));
    ed.open('box a "A"\nbox b "B" right of a gap 2\nbox c "C" below a\nalign y middle a, b, c');
    sel(['c']); ed.run('dgeDelete()');
    ok(compiles() && src() === 'box a "A"\nbox b "B" right of a gap 2\nalign y middle a, b',
      'an align keeps the two it still has', JSON.stringify(src()));

    // ── an actor goes with its messages (R7) ────────────────────────
    ed.open('sequence s\n  actor u "U"\n  actor v "V"\n  actor w "W"\n  u -> v "hi"\n  v -> w "ho"\n'
      + '  note w "n"\nbrace b over s-1 side right "x"');
    sel(['u']); ed.run('dgeDelete()');
    ok(compiles() && src() === 'sequence s\n  actor v "V"\n  actor w "W"\n  v -> w "ho"\n  note w "n"\n'
      + 'brace b over s-0 side right "x"',
    'deleting an actor takes its messages, and the brace follows the message that moved up',
    JSON.stringify(src()) + ' · ' + note());
    ok(/line 5: message s-0 \(u -> v\) runs from or to u/.test(asked), 'the confirmation lists the message',
      JSON.stringify(asked));

    // ── a delete that renumbers rewrites (R8) ───────────────────────
    ed.open('sequence s\n  actor u "U"\n  actor v "V"\n  u -> v "hi"\n  v -> u "ho"\n  u -> v "x"\n'
      + 'brace b over s-1 side right "x"\nstep k\n  emph @s-msg-2');
    sel(['s-0']); ed.run('dgeDelete()');
    ok(compiles() && /\nbrace b over s-0 side right "x"\nstep k\n {2}emph @s-msg-1$/.test(src()),
      'deleting the first message moves every reference to a later one with it', JSON.stringify(src()));
    ed.ctx.confirm = () => true;
  }

  // ── duplicating what a statement generated (R5) ───────────────────
  ed.open('table t "A | B" at 0,0\n  "x | y"');
  sel(['t-0-1']); ed.run('dgeDuplicate()');
  ok(compiles() && src() === 'table t "A | B" at 0,0\n  "x | y"\ntable t2 "A | B" at 0,0\n  "x | y"'
    && ed.DGE.selection.join() === 't2', 'duplicating a cell duplicates its table', JSON.stringify(src()));
  ed.open('sequence s\n  actor u "U"\n  actor v "V"\n  u -> v "hi"');
  sel(['u']); ed.run('dgeDuplicate()');
  ok(compiles() && src() === 'sequence s\n  actor u "U"\n  actor u2 "U"\n  actor v "V"\n  u -> v "hi"'
    && ed.DGE.selection.join() === 'u2', 'duplicating an actor adds one to the run', JSON.stringify(src()));
  ed.open('sequence s\n  actor u "U"\n  actor v "V"\n  u -> v "hi"\n  v -> u "ho"\nbrace b over s-1 side right "x"');
  sel(['s-0']); ed.run('dgeDuplicate()');
  ok(compiles() && src() === 'sequence s\n  actor u "U"\n  actor v "V"\n  u -> v "hi"\n  u -> v "hi"\n'
    + '  v -> u "ho"\nbrace b over s-2 side right "x"' && ed.DGE.selection.join() === 's-1',
  'duplicating a message renumbers the later ones and what names them', JSON.stringify(src()));
  ed.open('box a "A"');
  {
    const real = ed.ctx.dgeSetSource;
    ed.ctx.dgeSetSource = () => false;
    sel(['a']); ed.run('dgeDuplicate()');
    ok(ed.DGE.selection.join() === 'a', 'a refused duplicate leaves the selection alone', JSON.stringify(ed.DGE.selection));
    ed.ctx.dgeSetSource = real;
  }

  // ── a name that is also a word (R6) ───────────────────────────────
  for (const [word, body, want] of [
    ['left', 'box left "L"\nbox a "A" right of left\nedge e a.left -- left.right',
      'box c "L"\nbox a "A" right of c\nedge e a.left -- c.right'],
    ['at', 'sequence s at 0,0\n  actor at "U"\n  actor v "V"\n  at -> v "hi"',
      'sequence s at 0,0\n  actor c "U"\n  actor v "V"\n  c -> v "hi"'],
    ['at', 'bars at "1,2" at 0,0\nbars b "3,4" series of at', 'bars c "1,2" at 0,0\nbars b "3,4" series of c'],
    ['at', 'plot at "x" "y" at 0,0\nplot p2 "x" "y" below at same as at',
      'plot c "x" "y" at 0,0\nplot p2 "x" "y" below c same as c'],
  ]) {
    ed.open(body);
    ed.run(`dgeRename(${JSON.stringify(word)}, "c")`);
    ok(compiles() && src() === want, `\`${word}\` renamed where a port or a checked reference names it`,
      JSON.stringify(src()) + ' · ' + note());
  }

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
