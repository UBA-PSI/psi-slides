/*
 * Peers share one size, and a box is never too small for its words.
 *
 * Four rules meet here and each one is a default rather than a construct, so
 * every assertion is paired with a control that differs in one token: a
 * default that arrives for the wrong reason looks identical to one that
 * arrives for the right one, and only the pair can tell them apart.
 *
 *   the chain    a run of `right of` / `left of` shares width and height; a
 *                run of `below` / `above` shares width alone, because a stack
 *                of bands is as often a record as it is a row on its side
 *   row / col    the explicit spelling, which also places what it names
 *   same w/h as  one axis copied, which `same as` could not say
 *   too small    a written `h` under its label warns, as a written `w` does,
 *                and so does a written table `row`
 *
 * Sizes are read out of the emitted `<rect>`s and compared for *difference*,
 * never against a literal: label widths are estimated here, so a coordinate
 * baked into an assertion pins the estimate rather than the meaning.
 */
import { render, lintAll } from './harness.mjs';

export const name = 'peers share one size, and a box holds its words';

const P = 'dg1-';
/** The rect a box's group draws, as {x, y, w, h}, or null. */
const rectOf = (out, id) => {
  const g = out.match(new RegExp(`id="${P}${id}"[\\s\\S]*?(<(?:rect|path)[^>]*>)`));
  if (!g) return null;
  const r = g[1];
  const num = (a) => {
    const m = r.match(new RegExp(`\\b${a}="(-?[\\d.]+)"`));
    return m ? +m[1] : null;
  };
  if (r.startsWith('<rect')) {
    return { x: num('x'), y: num('y'), w: num('width'), h: num('height') };
  }
  // A shaped outline is a path; its extent is the span of its own points.
  const pts = [...r.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)].map(m => [+m[1], +m[2]]);
  if (!pts.length) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};

export async function run({ report }) {
  const { ok } = report;
  // Every lint assertion in one invocation: `lintAll` spawns `lint.js` as a
  // process, so one call for the file is the difference between a gate that
  // runs in milliseconds and one that does not.
  const LINT = [
    { name: 'row places its members',
      body: 'box a "x" at 0,0\nbox b "y"\nbox c "z"\nrow a, b, c gap 1',
      rule: 'diagram-no-placement', want: 0 },
    { name: 'and an element no row names is still asked',
      body: 'box a "x" at 0,0\nbox b "y"',
      rule: 'diagram-no-placement', want: 1 },
    { name: 'and a row does not excuse its own first member',
      body: 'box a "x" at 0,0\nbox b "y"\nbox c "z"\nrow b, c gap 1',
      rule: 'diagram-no-placement', want: 1 },
    { name: 'a row of one',
      body: 'box a "x" at 0,0\nbox b "y" right of a gap 1\nrow a',
      rule: 'bad-diagram-row', want: 1 },
    { name: 'a row with a word after its gap',
      body: 'box a "x" at 0,0\nbox b "y" right of a gap 1\nrow a, b gap 1 flush left',
      rule: 'bad-diagram-row', want: 1 },
    { name: 'a third axis on "same"',
      body: 'box a "x" at 0,0\nbox b "y" at 0,3 same q as a',
      rule: 'diagram-unexpected-token', want: 1 },
    { name: 'a zone with one number and nothing in it',
      body: 'zone z "area" at 0,0 w 3',
      rule: 'bad-diagram-zone', want: 1 },
    { name: 'a zone with one number and something in it',
      body: 'zone z "area" at 0,0 w 3\nbox a "x" in z',
      rule: 'bad-diagram-zone', want: 0 },
    { name: 'a zone that takes its height from an element',
      body: 'box a "x" at 0,0 h 2\nzone z "area" at 0,3 w 3 same h as a',
      rule: 'bad-diagram-zone', want: 0 },
    { name: 'same w as names an element that has to exist',
      body: 'box a "x" at 0,0\nbox b "y" at 0,3 same w as nope',
      rule: 'unknown-diagram-ref', want: 1 },
    // ── the band ────────────────────────────────────────────────────
    // A band belongs to a zone, `in` places one element or a whole run in it,
    // and both refusals are deferred to the end of the block in both files:
    // a zone may be written after the things that stand in it.
    { name: 'in names a zone and not a box',
      body: 'box q "Q" at 0,0\nbox a "A" in q',
      rule: 'bad-diagram-zone', want: 1 },
    { name: 'and neither does the coordinate form',
      body: 'box q "Q" at 0,0 w 2 h 2\ntext a "A" at q.inner.left,q.inner.top',
      rule: 'bad-diagram-zone', want: 1 },
    { name: 'in a zone declared after it is not a mistake',
      body: 'box a "A" in z\nzone z "area" at 0,0 w 3 h 2',
      rule: 'bad-diagram-zone', want: 0 },
    { name: 'a band takes no anchor',
      body: 'zone z "area" at 0,0 w 3 h 2\nbox a "A" in z anchor tl',
      rule: 'bad-diagram-placement', want: 1 },
    { name: 'nor a flush',
      body: 'zone z "area" at 0,0 w 3 h 2\nbox a "A" in z flush left',
      rule: 'bad-diagram-placement', want: 1 },
    { name: 'in expects a name',
      body: 'zone z "area" at 0,0 w 3 h 2\nbox a "A" in',
      rule: 'bad-diagram-placement', want: 1 },
    { name: 'the band words are a placement, so they are not unexpected tokens',
      body: 'zone z "area" at 0,0 w 3 h 2\nbox a "A" in z gap 0.2 center bottom',
      rule: 'diagram-unexpected-token', want: 0 },
    { name: 'a row placed in a zone places its first member too',
      body: 'zone z "area" at 0,0 w 6 h 2\nbox a "A"\nbox b "B"\nrow a, b in z center',
      rule: 'diagram-no-placement', want: 0 },
    { name: 'and a row in a zone with no name is refused',
      body: 'zone z "area" at 0,0 w 6 h 2\nbox a "A" at 0,0\nbox b "B" right of a gap 1\nrow a, b in',
      rule: 'bad-diagram-row', want: 1 },
    { name: 'and a word that is neither a member nor a band word is still refused',
      body: 'zone z "area" at 0,0 w 6 h 2\nbox a "A" at 0,0\nbox b "B" right of a gap 1\nrow a, b in z sideways',
      rule: 'bad-diagram-row', want: 1 },
  ];
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 0.5;

  // ── a row shares both axes ────────────────────────────────────────
  {
    const r = render([
      'box a "x" at 0,0',
      'box b "a considerably longer label" right of a gap 1',
      'box c "y" right of b gap 1',
    ].join('\n'));
    ok(r.ok, 'a row of three compiles', r.msg);
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b'), C = rectOf(r.out, 'c');
    ok(near(A.w, B.w) && near(B.w, C.w), 'a row shares one width',
      `${A && A.w} / ${B && B.w} / ${C && C.w}`);
    ok(near(A.h, B.h), 'and one height', `${A && A.h} / ${B && B.h}`);
  }
  {
    // The control: one member leaves the chain and keeps its own width.
    const r = render([
      'box a "x" at 0,0 {.own}',
      'box b "a considerably longer label" right of a gap 1',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(A.w < B.w - 1, '.own leaves the chain', `${A && A.w} vs ${B && B.w}`);
  }
  {
    // …and it ends the run: nothing reaches through it.
    const r = render([
      'box a "x" at 0,0',
      'box b "a considerably longer label" right of a gap 1 {.own}',
      'box c "y" right of b gap 1',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b'), C = rectOf(r.out, 'c');
    ok(A.w < B.w - 1 && C.w < B.w - 1, '.own ends the chain on both sides',
      `${A && A.w} / ${B && B.w} / ${C && C.w}`);
  }
  {
    // A written w on one member is that member's own *and* the chain's.
    const bare = render('box a "x" at 0,0\nbox b "y" right of a gap 1');
    const wide = render('box a "x" at 0,0 w 2\nbox b "y" right of a gap 1');
    const b0 = rectOf(bare.out, 'b'), b1 = rectOf(wide.out, 'b');
    ok(b1.w > b0.w + 1, 'a written w on the head is the chain\'s width too',
      `${b0 && b0.w} -> ${b1 && b1.w}`);
    ok(near(b1.w, rectOf(wide.out, 'a').w), 'and the two come out equal',
      `${b1 && b1.w} vs ${rectOf(wide.out, 'a').w}`);
  }

  // ── a column shares its width and not its height ──────────────────
  {
    const r = render([
      'box a "one\\ntwo\\nthree\\nfour" at 0,0',
      'box b "a considerably longer label" below a gap 0',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(near(A.w, B.w), 'a column shares one width', `${A && A.w} / ${B && B.w}`);
    ok(A.h > B.h + 1, 'and keeps each band its own height – a record is not a row on its side',
      `${A && A.h} / ${B && B.h}`);
  }
  {
    // `col` is the explicit form, and it *does* share the height.
    const r = render([
      'box a "one\\ntwo\\nthree\\nfour" at 0,0',
      'box b "short" below a gap 0',
      'col a, b',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(near(A.h, B.h), 'col shares the height a bare "below" does not',
      `${A && A.h} / ${B && B.h}`);
  }

  // ── one below between two rows does not size a grid ───────────────
  {
    const r = render([
      'box a "x" at 0,0',
      'box b "y" right of a gap 1',
      'box p "a considerably longer label" below a gap 1',
      'box q "z" right of p gap 1',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b'), P = rectOf(r.out, 'p');
    ok(near(A.w, P.w), 'the box above the long one takes the column\'s width',
      `${A && A.w} / ${P && P.w}`);
    ok(B.w < P.w - 1, 'but its neighbour in the row does not – the families never merge',
      `${B && B.w} vs ${P && P.w}`);
  }

  {
    // …and that is the case a `row` statement is worth writing for: it reads
    // what the implicit families settled, so it levels its members against
    // everything else they stand in.
    const body = [
      'box a "x" at 0,0',
      'box b "y" right of a gap 1',
      'box p "a considerably longer label" below b gap 1',
    ].join('\n');
    const bare = render(body);
    const said = render(body + '\nrow a, b');
    const A0 = rectOf(bare.out, 'a'), B0 = rectOf(bare.out, 'b');
    const A1 = rectOf(said.out, 'a'), B1 = rectOf(said.out, 'b');
    ok(A0.w < B0.w - 1, 'without it the row is not level, because the column is not the row',
      `${A0 && A0.w} / ${B0 && B0.w}`);
    ok(near(A1.w, B1.w), 'and "row a, b" levels them', `${A1 && A1.w} / ${B1 && B1.w}`);
  }

  // ── a label a step will give it is measured at beat 0 ─────────────
  {
    const grew = render([
      'box a "x" at 0,0',
      'box b "y" right of a gap 1',
      'step later',
      '  label b "a considerably longer label"',
    ].join('\n'));
    const still = render('box a "x" at 0,0\nbox b "y" right of a gap 1');
    const g = rectOf(grew.out, 'a'), s = rectOf(still.out, 'a');
    ok(g.w > s.w + 1, 'a chain is sized for every label a step will give a member',
      `${s && s.w} -> ${g && g.w}`);
  }

  // ── row / col place what they name ────────────────────────────────
  {
    const r = render([
      'box a "x" at 0,0',
      'box b "y"',
      'box c "z"',
      'row a, b, c gap 1',
    ].join('\n'));
    ok(r.ok, 'row places its members, so they need no placement of their own', r.msg);
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b'), C = rectOf(r.out, 'c');
    ok(A.x < B.x && B.x < C.x, 'and it places them left to right',
      `${A && A.x} / ${B && B.x} / ${C && C.x}`);
    ok(near(B.x - (A.x + A.w), C.x - (B.x + B.w)), 'with one gap',
      `${B.x - (A.x + A.w)} / ${C.x - (B.x + B.w)}`);
  }
  {
    const r = render('box a "x" at 0,0\nbox b "y"');
    ok(!r.ok && /has no placement/.test(r.msg || ''),
      'an element no row names is still asked where it goes', r.msg);
    const first = render('box a "x" at 0,0\nbox b "y"\nbox c "z"\nrow b, c gap 1');
    ok(!first.ok && /box b has no placement/.test(first.msg || ''),
      'and a row places every member after the first, so the first still has to say',
      first.msg);
  }
  {
    const bad = render('box a "x" at 0,0\nbox b "y" right of a gap 1\nrow a');
    ok(!bad.ok && /at least two/.test(bad.msg || ''), 'a row of one is refused', bad.msg);
  }
  {
    const bad = render('box a "x" at 0,0\nbox b "y" right of a gap 1\nrow a, b gap 1 flush left');
    ok(!bad.ok && /nothing else/.test(bad.msg || ''),
      'a row takes its members and one gap and nothing else', bad.msg);
  }
  {
    const bad = render('box a "x" at 0,0\ntext t "hi" right of a gap 1\nrow a, t');
    ok(!bad.ok && /a row is a run of boxes/.test(bad.msg || ''),
      'a row is a run of boxes, and says so when it is handed something else', bad.msg);
  }

  // ── same w as / same h as ─────────────────────────────────────────
  {
    const r = render([
      'box a "one\\ntwo" at 0,0 {.own}',
      'box b "a much longer label" at 0,3 same h as a {.own}',
    ].join('\n'));
    ok(r.ok, 'same h as compiles', r.msg);
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(near(A.h, B.h), 'same h as takes the height', `${A && A.h} / ${B && B.h}`);
    ok(B.w > A.w + 1, 'and leaves the width alone', `${A && A.w} / ${B && B.w}`);
  }
  {
    const r = render([
      'box a "one\\ntwo" at 0,0 {.own}',
      'box b "x" at 0,3 same w as a {.own}',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(near(A.w, B.w), 'same w as takes the width', `${A && A.w} / ${B && B.w}`);
    ok(A.h > B.h + 1, 'and leaves the height alone', `${A && A.h} / ${B && B.h}`);
  }
  {
    const bad = render('box a "x" at 0,0\nbox b "y" at 0,3 same as a same h as a');
    ok(!bad.ok && /nothing left to say/.test(bad.msg || ''),
      '"same as" and "same h as" together are one size said twice', bad.msg);
  }
  {
    const bad = render('box a "x" at 0,0\nbox b "y" at 0,3 same q as a');
    ok(!bad.ok, 'a third axis is not a thing', bad.msg);
  }
  {
    // A zone needs both numbers, or an element to take one from.
    const bad = render('zone z "area" at 0,0 w 3');
    ok(!bad.ok && /nothing to take the size from/.test(bad.msg || ''),
      'a zone with one number and nothing in it is refused', bad.msg);
    const held = render('zone z "area" at 0,0 w 3\nbox a "x" in z');
    ok(held.ok, 'and the same zone with something in it takes the other number from it', held.msg);
    const good = render('box a "x" at 0,0 h 2\nzone z "area" at 0,3 w 3 same h as a');
    ok(good.ok, 'a zone takes its height from an element', good.msg);
  }

  // ── a written size too small for its words ────────────────────────
  {
    const r = render('box a "one\\ntwo\\nthree" at 0,0 h 0.1');
    ok(r.warns.some(w => /units tall but its label needs/.test(w)),
      'a written h under its label warns', r.warns.join(' | '));
    const c = render('box a "one\\ntwo\\nthree" at 0,0 h 2');
    ok(!c.warns.some(w => /units tall/.test(w)), 'and a roomy one does not', c.warns.join(' | '));
  }
  {
    const r = render('box a "x" at 0,0 h 0.1 {.fit} w 1');
    ok(!r.warns.some(w => /units tall/.test(w)),
      'a fitted label cannot overflow, so it is not warned about', r.warns.join(' | '));
  }
  {
    // A table's rows are continuation lines, one quoted string each.
    const tbl = (opts) => `table t "A|B" at 0,0 col 1,1${opts}\n"one\\ntwo|x"`;
    const r = render(tbl(''));
    ok(r.ok, 'a table with a two-line cell compiles', r.msg);
    const auto = rectOf(r.out, 't-0-1');
    const one = rectOf(render('table t "A|B" at 0,0 col 1,1\n"one|x"').out, 't-0-1');
    ok(auto && one && auto.h > one.h + 1, 'a table row is as tall as its tallest cell',
      `${one && one.h} -> ${auto && auto.h}`);
    const w = render(tbl(' row 0.2'));
    ok(w.warns.some(x => /rows 0.2 units tall/.test(x)),
      'and a written row under it warns', w.warns.join(' | '));
    const q = render('table t "A|B" at 0,0 col 1,1 row 0.42\n"one|x"');
    ok(!q.warns.some(x => /rows/.test(x)),
      'a row written tighter than the rhythm but wide enough for the type does not',
      q.warns.join(' | '));
  }

  // ── a default layer's size is a floor, not a pin ──────────────────
  // The chain can raise it and nothing can lower it. Every pair here is the
  // same block with and without one token, because a box that comes out at
  // the layer's number because the layer pinned it and one that comes out
  // there because nothing asked for more are the same rectangle.
  {
    // The keynote's build plan, in five lines: a grid of cells on one floor,
    // and one row that is taller. The `h 4.8` used to have to be written on
    // both cells of the row, because the floor counted as a written size and
    // neither the chain nor a `row` could reach past it.
    const body = (second) => [
      'default box w 3 h 1',
      'box z11 "" at 0,0',
      'box z12 "" right of z11 gap 0.5',
      `box z21 "" below z11 gap 0.5 h 2.5`,
      `box z22 "" right of z21 gap 0.5${second}`,
    ].join('\n');
    const r = render(body(''));
    ok(r.ok, 'a floor with one taller row compiles', r.msg);
    const a = rectOf(r.out, 'z21'), b = rectOf(r.out, 'z22');
    const c = rectOf(r.out, 'z11'), d = rectOf(r.out, 'z12');
    ok(near(a.h, b.h), 'a row levels a height the default layer floored',
      `${a && a.h} / ${b && b.h}`);
    ok(near(c.h, d.h) && c.h < a.h - 1, 'and the row that said nothing stays on the floor',
      `${c && c.h} / ${d && d.h} vs ${a && a.h}`);
    const twice = render(body(' h 2.5'));
    ok(near(b.h, rectOf(twice.out, 'z22').h) && near(a.w, rectOf(twice.out, 'z21').w),
      'so the second copy of the number is worth nothing – dropping it moves nothing',
      `${b && b.h} vs ${rectOf(twice.out, 'z22').h}`);
  }
  {
    // The other direction: the chain asks for less than the floor, and the
    // floor stands. Both boxes hold two letters and come out three units wide.
    const r = render('default box w 3\nbox a "x" at 0,0\nbox b "y" right of a gap 1');
    const bare = render('box a "x" at 0,0\nbox b "y" right of a gap 1');
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b'), N = rectOf(bare.out, 'a');
    ok(near(A.w, B.w) && A.w > N.w + 1, 'a floor over what the labels ask for is what they get',
      `${A && A.w} / ${B && B.w} vs ${N && N.w} unfloored`);
  }
  {
    // …and the same sentence one layer down, which is why the floor is not
    // evidence either: a tag layer that sizes some of the boxes says those
    // boxes differ, so the column it leaves ragged is the author's own. This
    // is `lectures/diagrams#cbc`, where the Dec boxes hang under the
    // ciphertext boxes and are meant to be narrower than them.
    const r = render([
      'default box w 3',
      'default box @dec w 1',
      'box c "x" at 0,0',
      'box d "y" below c gap 1 {@dec}',
    ].join('\n'));
    const C = rectOf(r.out, 'c'), D = rectOf(r.out, 'd');
    ok(D.w < C.w - 1, 'a tag layer under a block layer keeps its own narrower boxes',
      `${D && D.w} vs ${C && C.w}`);
  }
  {
    // A number on the element's own line is still a pin: the layer does not
    // raise it, and its neighbour's floor is not lowered by it either.
    const r = render('default box w 3\nbox a "x" at 0,0 w 0.6\nbox b "y" right of a gap 1');
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(A.w < B.w - 1, 'a written w beside a default layer pins that box alone',
      `${A && A.w} vs ${B && B.w}`);
    const wide = render('default box w 1\nbox a "x" at 0,0 w 3\nbox b "y" right of a gap 1');
    const A2 = rectOf(wide.out, 'a'), B2 = rectOf(wide.out, 'b');
    ok(near(A2.w, B2.w), 'and a written w above the floor is the chain\'s width',
      `${A2 && A2.w} / ${B2 && B2.w}`);
  }
  {
    // `.own` in a default layer switches chaining off for the whole block,
    // which is what `lectures/diagrams#alignment` is written on: a figure
    // whose subject is what uneven widths do to a row has nothing to show
    // once the row is level.
    const r = render([
      'default box {.own}',
      'box a "one" at 0,0',
      'box b "a much longer label" right of a gap 1',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b');
    ok(A.w < B.w - 1, '.own in a default layer leaves every box its own size',
      `${A && A.w} vs ${B && B.w}`);
    const lvl = render('box a "one" at 0,0\nbox b "a much longer label" right of a gap 1');
    ok(near(rectOf(lvl.out, 'a').w, rectOf(lvl.out, 'b').w),
      'and without the layer the same two are level',
      `${rectOf(lvl.out, 'a').w} / ${rectOf(lvl.out, 'b').w}`);
  }

  // ── the two exemptions are exemptions, not escape hatches ─────────
  {
    const r = render([
      'box fw "FIREWALL" at 0,0 h 1.5 {.turn}',
      'box sw "SWITCH" right of fw gap 1',
    ].join('\n'));
    const F = rectOf(r.out, 'fw'), S = rectOf(r.out, 'sw');
    ok(F.w < S.w - 1, 'a .turn box is a bar and keeps its own width',
      `${F && F.w} / ${S && S.w}`);
  }
  {
    const r = render([
      'box a "a considerably longer label" at 0,0',
      'box b "x" right of a gap 1 same as a',
      'box c "y" right of b gap 1',
    ].join('\n'));
    const A = rectOf(r.out, 'a'), B = rectOf(r.out, 'b'), C = rectOf(r.out, 'c');
    ok(near(A.w, B.w), 'same as still wins', `${A && A.w} / ${B && B.w}`);
    ok(C.w < A.w - 1, 'and it ends the chain like .own does', `${C && C.w} / ${A && A.w}`);
  }
  {
    // `.own` is a fact about the drawing, not about a beat.
    const bad = render([
      'box a "x" at 0,0',
      'box b "y" right of a gap 1',
      'step later',
      '  style b {.own}',
    ].join('\n'));
    ok(!bad.ok && /settled once/.test(bad.msg || ''),
      'a step cannot take a box out of its chain', bad.msg);
  }

  // ── and lint says the same ────────────────────────────────────────
  // The direction that matters is a linter laxer than the build: CI lints
  // lectures it never builds, so a rule only the compiler knows merges green.
  {
    const found = lintAll(LINT);
    LINT.forEach((c, i) => {
      const hits = found[i].filter(f => f.rule === c.rule);
      ok(hits.length === c.want, `lint agrees: ${c.name} (${c.rule} x${c.want})`,
        found[i].map(f => `${f.rule}: ${f.msg}`).join(' | ') || '(nothing)');
    });
  }
}
