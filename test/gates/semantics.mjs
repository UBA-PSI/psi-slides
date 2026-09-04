/*
 * What the emitted drawing *means*, as distinct from whether the source
 * parsed.
 *
 * This gate exists because a green acceptance test made a wrong drawing look
 * right. `accepts.mjs` carried `reg r <-> u` and asked only whether the block
 * compiled; it did, and it drew one arrowhead, because a sequence message kept
 * a one-bit arrow model (`headless: tok === '--'`) beside the four-state table
 * every direct edge reads. Parsing acceptance, build/lint agreement, emitted
 * semantics and beat-local runtime behaviour are four different contracts, and
 * three of the four had a gate.
 *
 * So every assertion here reads the SVG the compiler produced and asks what a
 * reader would see: which classes an element ended up with, whether an
 * arrowhead was actually drawn, which side of a line a label sits on. Where
 * the question is "did this default arrive", the fixture is paired with a
 * control that differs in exactly the one token under test – a bare removal
 * with no default to remove can appear to work while doing nothing, which is
 * how the expanding statements shipped losing every `{!class}` they were
 * handed.
 *
 * Numbers are compared for *difference*, never against a literal: text width
 * here is estimated rather than measured, so a coordinate baked into an
 * assertion pins the estimate rather than the meaning.
 *
 * One block at the end reads no SVG: the span table is what a source *means*
 * to the editor that rewrites it, and it is decided by the compiler alone. It
 * lives here rather than in a browser spec for the same reason as everything
 * else in this directory – it needs no page to answer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { frames, render, spans, ROOT } from './harness.mjs';
import { DG_THEMES } from '../../diagram-core.mjs';

export const name = 'the emitted drawing means what the source says';

// ── reading the SVG back ────────────────────────────────────────────
// One figure per render, so the id prefix is always `dg1-`.
const P = 'dg1-';
const attrOf = (out, id, attr) => {
  const m = out.match(new RegExp(`id="${P}${id}"[^>]*\\b${attr}="([^"]*)"`));
  return m ? m[1] : null;
};
const clsOf = (out, id) => attrOf(out, id, 'class');
const hasEl = (out, id) => out.includes(`id="${P}${id}"`);
/** The classes of an element's group, as a Set, or null if it was not drawn. */
const setOf = (out, id) => {
  const c = clsOf(out, id);
  return c === null ? null : new Set(c.split(/\s+/).filter(Boolean));
};
/** Every point in a path's `d`, as [x, y] pairs. */
const points = (d) => [...String(d || '').matchAll(/(-?[\d.]+)\s+(-?[\d.]+)/g)]
  .map(m => [+m[1], +m[2]]);
/**
 * Whether an arrowhead is drawn or collapsed onto its own tip. A head is
 * emitted in every frame of any edge that could ever want one – that is what
 * lets a beat tween it in and out – so "is there a head" is a question about
 * its area, not about whether the node exists.
 */
const headDrawn = (out, id) => {
  const p = points(attrOf(out, id, 'd'));
  if (p.length < 3) return false;
  return p.some(([x, y]) => x !== p[0][0] || y !== p[0][1]);
};
/** The tip of an arrowhead – the first point of the triangle. */
const headTip = (out, id) => points(attrOf(out, id, 'd'))[0];
/** Where a label's wrapper was translated to. */
const labelAt = (out, id) => {
  const t = attrOf(out, `${id}--lw0`, 'transform');
  const m = t && t.match(/translate\((-?[\d.]+),(-?[\d.]+)\)/);
  return m ? [+m[1], +m[2]] : null;
};

const SEQ = (body, tail = '') => `sequence s at 0,0${tail}\n${body}`;
const AB = '  actor a "A"\n  actor b "B"\n';

export async function run({ report }) {
  const { ok, note } = report;
  // A compile that fails says so once, in place, rather than as five
  // assertions about a null.
  const fig = (what, body, head = '') => {
    const r = render(body, head);
    if (!r.ok) { ok(false, `${what} compiles`, r.msg.split('\n').slice(0, 2).join(' / ')); return null; }
    return r.out;
  };

  // ── the four arrow tokens, on a message and on a direct edge ──────
  // The token family table promises the same four tokens and the same
  // none / one / both meanings in both places. `<->` was accepted by the
  // sub-grammar and drew like `->`.
  const HEADS = { '--': 'no-head', '->': 'one-head', '<-': 'one-head', '<->': 'both-heads' };
  for (const [tok, cls] of Object.entries(HEADS)) {
    const out = fig(`a message written ${tok}`, SEQ(AB + `  a ${tok} b "M"`));
    if (!out) continue;
    const got = setOf(out, 's-0');
    ok(got && got.has(cls), `a sequence message ${tok} carries .${cls}`,
      got ? [...got].join(' ') : 'the message was not drawn');
    // Both ends, read off the drawing rather than off the class string.
    const first = headDrawn(out, 's-0--h');
    const second = hasEl(out, 's-0--h2') && headDrawn(out, 's-0--h2');
    const want = { '--': [false, false], '->': [true, false], '<-': [true, false], '<->': [true, true] }[tok];
    ok(first === want[0] && second === want[1],
      `a sequence message ${tok} draws ${want.filter(Boolean).length} head(s)`,
      `drew ${[first && 'one', second && 'a second'].filter(Boolean).join(' and ') || 'none'}`);
    // And the same token on an ordinary edge says the same thing, which is
    // the promise that made a second arrow model a defect rather than a
    // variation.
    const e = fig(`an edge written ${tok}`, `box a "A" at 0,0\nbox c "C" right of a gap 1\nedge a ${tok} c`);
    const ec = e && setOf(e, 'edge-1');
    ok(ec && ec.has(cls), `an ordinary edge ${tok} carries the same .${cls}`,
      ec ? [...ec].join(' ') : 'the edge was not drawn');
  }

  // Which end the single head sits on. `<-` flips the two operands, so the
  // head belongs at the *from* actor – the left column – and `->` at the
  // right. A class alone cannot tell these two apart.
  {
    const right = fig('a message pointing right', SEQ(AB + '  a -> b "M"'));
    const left = fig('a message pointing left', SEQ(AB + '  a <- b "M"'));
    if (right && left) {
      const rx = headTip(right, 's-0--h')[0], lx = headTip(left, 's-0--h')[0];
      ok(rx > 0 && lx < 0, 'the one head of -> and <- sits at opposite ends',
        `-> tip at x=${rx}, <- tip at x=${lx}`);
    }
  }

  // A self-message is a loop out of the lifeline and back, and the proposal
  // promises `u <-> u` as a round trip: both ends of a loop that leaves and
  // returns to one actor.
  {
    const out = fig('a two-headed self-message', SEQ('  actor a "A"\n  a <-> a "loop"'));
    if (out) {
      const got = setOf(out, 's-0');
      ok(got && got.has('both-heads') && headDrawn(out, 's-0--h') && headDrawn(out, 's-0--h2'),
        'a self-message <-> draws a head at each end of its loop',
        got ? [...got].join(' ') : 'not drawn');
    }
  }

  // ── a column is a bar, not a box ──────────────────────────────────
  // Its outline was ink that encoded nothing and never matched the
  // baseline it stood on, so a column arrives `bare` unless the author's own
  // tail says `.thick` – the same slot displacement `sharp` already uses –
  // and carries `dg-bar` in its base class, which is what lets the
  // stylesheet mean "a fill" by `emph` on a column and "an outline" by the
  // same word everywhere else. The base is what the runtime rebuilds the
  // class string from every frame, so it is read off data-base, not class.
  {
    const plain = fig('bars with no tail', 'bars f "3,5" at 0,0 w 2 h 1 emph 1\nbox b "B" right of f gap 1');
    const thick = fig('bars with .thick', 'bars f "3,5" at 0,0 w 2 h 1 {.thick}');
    if (plain && thick) {
      const c0 = setOf(plain, 'f-0'), c1 = setOf(plain, 'f-1'), t = setOf(thick, 'f-0');
      ok(c0 && c0.has('bare') && c0.has('sharp'),
        'a column arrives bare and sharp with no tail written',
        c0 ? [...c0].join(' ') : 'f-0 was not drawn');
      ok(c1 && c1.has('emph') && c1.has('bare'),
        'emph on a column keeps it bare – the fill is the emphasis, not an outline',
        c1 ? [...c1].join(' ') : 'f-1 was not drawn');
      ok(t && t.has('thick') && !t.has('bare'),
        '.thick on the bars line displaces the bare a column arrives with',
        t ? [...t].join(' ') : 'f-0 was not drawn');
      ok(attrOf(plain, 'f-0', 'data-base') === 'dg-el dg-box dg-bar'
        && attrOf(plain, 'b', 'data-base') === 'dg-el dg-box',
        'a column carries dg-bar in its base class and an authored box does not',
        `${attrOf(plain, 'f-0', 'data-base')} / ${attrOf(plain, 'b', 'data-base')}`);
    }
  }

  // ── a chart draws its own legend ──────────────────────────────────
  // `key "…"` on a bars line makes a swatch and a name. The swatch is a
  // column of the run - same classes, same role - which is the whole point:
  // a legend built out of boxes shows a tone at a box's strength, and that
  // is not what the columns are filled with. Entries stand in one row above
  // the frame, in source order, a series appending to its chart's row.
  {
    const out = fig('bars with keys',
      'bars f "3,5" at 0,0 w 2 h 1 key "one" {.tone-3}\nbars g "1,2" series of f key "two" {.tone-4}');
    if (out) {
      const sw = setOf(out, 'f-key'), sw2 = setOf(out, 'g-key');
      ok(sw && sw.has('tone-3') && sw.has('bare') && sw.has('sharp')
        && attrOf(out, 'f-key', 'data-base') === 'dg-el dg-box dg-bar',
        'the swatch is a column of its run: the run\'s classes and the bar role',
        sw ? [...sw].join(' ') + ' / ' + attrOf(out, 'f-key', 'data-base') : 'f-key was not drawn');
      ok(sw2 && sw2.has('tone-4') && hasEl(out, 'f-key-label') && hasEl(out, 'g-key-label'),
        'a series names itself into the same legend, with its own classes',
        sw2 ? [...sw2].join(' ') : 'g-key was not drawn');
      const fx = Number(attrOf(out, 'f-key--r', 'x')), gx = Number(attrOf(out, 'g-key--r', 'x'));
      const fy = Number(attrOf(out, 'f-key--r', 'y')), top = Number(attrOf(out, 'f--r', 'y'));
      ok(Number.isFinite(fx) && Number.isFinite(gx) && gx > fx && fy < top,
        'the entries stand in a row above the frame, the series to the right of the chart',
        `f-key x ${fx}, g-key x ${gx}, f-key y ${fy}, frame top ${top}`);
    }
  }

  // ── the linter's theme table is the stylesheet's ─────────────────
  // DG_THEMES says which theme loses a column; build.js says what the theme
  // is. Copied numbers, so a gate that reads both and compares.
  {
    const css = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
    const trip = (block, tok) => {
      const m = block.match(new RegExp(`--${tok}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };
    const root = css.slice(css.indexOf('const AUDIENCE_CSS = `'), css.indexOf('--zoom:'));
    const inkL = Number((root.match(/--ink-l:\s*([\d.]+)/) || [])[1]);
    for (const [name, want] of Object.entries(DG_THEMES)) {
      const m = css.match(new RegExp(`body\\[data-theme=${name}\\]\\s*\\{([^}]*)\\}`));
      const block = m ? m[1] : '';
      const got = {
        paper: trip(block, 'paper') || trip(root, 'paper'),
        ink: trip(block, 'ink') || [inkL, 0.01, 260],
        emph: trip(block, 'emph') || trip(root, 'emph'),
      };
      const same = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
      ok(same(got.paper, want.paper) && same(got.ink, want.ink) && same(got.emph, want.emph),
        `DG_THEMES agrees with build.js for ${name}`, JSON.stringify(got));
    }
  }

  // ── a removal reaches what the statement expands into ─────────────
  // Paired against a control that differs only in the removal: a bare `!dim`
  // with no default under it removes nothing and looks identical either way,
  // which is exactly how these shipped broken.
  // `%T%` marks the tail the removal is written into, which is not always the
  // statement's own line: an `actor`, a `note` and a message each carry one on
  // the entry line, and it was the entry tails that lost their removals.
  const EXPANDERS = [
    ['bars', 'bars f "3,5" at 0,0 w 2 h 1%T%', 'f-0'],
    ['grid', 'grid g box 2x2 at 0,0 cell 0.5 space 0.2%T%', 'g-0-0'],
    ['table', 'table t "A|B" at 0,0 col 1,1 row 0.4%T%\n  "1|2"', 't-0-1'],
    ['lanes', 'lanes l "one | two" at 0,0 w 4 band 0.8%T%', 'l-0'],
    ['a sequence tail on its heads', SEQ(AB + '  a -> b "M"', '%T%'), 'a'],
    ['a sequence actor', SEQ('  actor a "A"%T%\n  actor b "B"\n  a -> b "M"'), 'a'],
    ['a sequence note', SEQ('  actor a "A"\n  note a "n"%T%'), 's-note-0'],
    ['a sequence message', SEQ(AB + '  a -> b "M"%T%'), 's-0'],
  ];
  for (const [what, body, gen] of EXPANDERS) {
    const kind = what === 'a sequence message' ? 'edge' : 'box';
    const control = fig(`${what} under a default`, `default ${kind} {.dim}\n` + body.replace('%T%', ''));
    const removed = fig(`${what} with a removal`, `default ${kind} {.dim}\n` + body.replace('%T%', ' {!dim}'));
    if (!control || !removed) continue;
    const c = setOf(control, gen), r = setOf(removed, gen);
    ok(c && c.has('dim'), `${what}: the control shows the default arriving on ${gen}`,
      c ? [...c].join(' ') : `${gen} was not drawn`);
    ok(r && !r.has('dim'), `${what}: {!dim} in the tail reaches ${gen}`,
      r ? [...r].join(' ') : `${gen} was not drawn`);
  }

  // ── the two tails of a sequence compose weak to strong ────────────
  // The statement's tail is the weak layer and an entry's own tail the
  // strong one. Flattening the two signs into one list applied every removal
  // before every positive, so one direction worked and the other silently
  // did not.
  {
    const head = (st, at) => {
      const out = fig(`a sequence ${st} with an actor ${at}`,
        SEQ(`  actor a "A" ${at}\n  actor b "B"\n  a -> b "M"`, ` ${st}`));
      return out && setOf(out, 'a');
    };
    const strongRemoval = head('{.dim}', '{!dim}');
    ok(strongRemoval && !strongRemoval.has('dim'),
      'an actor-entry removal beats a positive class on the sequence tail',
      strongRemoval ? [...strongRemoval].join(' ') : 'not drawn');
    const strongPositive = head('{!dim}', '{.dim}');
    ok(strongPositive && strongPositive.has('dim'),
      'an actor-entry class beats a removal on the sequence tail',
      strongPositive ? [...strongPositive].join(' ') : 'not drawn');
    const grouped = head('{.tone-1}', '{.tone-2}');
    ok(grouped && grouped.has('tone-2') && !grouped.has('tone-1'),
      'an actor-entry class displaces the sequence tail in the same slot',
      grouped ? [...grouped].join(' ') : 'not drawn');
    // The weak layer still arrives where the strong one says nothing: the
    // whole point of putting the statement's tail on the heads.
    const inherited = head('{.dim}', '');
    ok(inherited && inherited.has('dim'), 'the sequence tail still reaches an actor that says nothing',
      inherited ? [...inherited].join(' ') : 'not drawn');
  }

  // ── the paper reserved is the drawing made ───────────────────────
  // The composed tail decides an actor head's *footprint* as well as its
  // classes, and for a while it decided them from two different answers: the
  // measurement concatenated both tails' positives with no removals and no
  // slot displacement while the emitted element resolved them properly. The
  // failure is invisible to every other check, because the box comes out too
  // *large* and the too-narrow warning only speaks about boxes that are too
  // small. It is the same family as a figure sitting off-centre in an
  // oversized frame, one statement along.
  {
    const head = (st, at) => {
      const out = fig(`an actor sized under ${st || 'nothing'} and ${at || 'nothing'}`,
        SEQ(`  actor a "Authenticator" ${at}\n  actor b "B" ${at}`, st ? ` ${st}` : ''));
      return out && [attrOf(out, 'a--r', 'width'), attrOf(out, 'a--r', 'height')];
    };
    const plain = head('', '');
    const undone = head('{.large}', '{!large}');
    ok(undone && plain && undone[0] === plain[0] && undone[1] === plain[1],
      'an entry removal takes the statement tail out of the reserved footprint too',
      `removed ${undone && undone.join('x')}, plain ${plain && plain.join('x')}`);
    const displaced = head('{.mono}', '{.serif}');
    const serifOnly = head('', '{.serif}');
    ok(displaced && serifOnly && displaced[0] === serifOnly[0],
      'and slot displacement reaches it: a serif head is measured as serif, not as mono',
      `displaced ${displaced && displaced[0]}, serif only ${serifOnly && serifOnly[0]}`);
    const turned = head('', '{.turn}');
    ok(turned && +turned[1] > +turned[0],
      'a turned actor head reserves the box its rotated label needs',
      `${turned && turned.join('x')} – the label reads up the long side`);
  }

  // ── word-valued defaults act, and the element's own word wins ─────
  // `default edge side bottom` used to be refused by the compiler ("side
  // expects a number") and accepted by the linter. Parsing it is half the
  // fix; the other half is that it reaches the drawing.
  {
    const edge = (def, own) => {
      const out = fig(`an edge label ${def || 'with no default'}`,
        (def ? def + '\n' : '') + 'box a "A" at 0,0\nbox c "C" right of a gap 2\n'
        + `edge a -> c "m"${own ? ' ' + own : ''}`);
      return out && labelAt(out, 'edge-1');
    };
    const top = edge('default edge side top');
    const bottom = edge('default edge side bottom');
    ok(top && bottom && top[1] !== bottom[1], 'default edge side moves the label across the line',
      `top at y=${top && top[1]}, bottom at y=${bottom && bottom[1]}`);
    const overridden = edge('default edge side bottom', 'side top');
    ok(overridden && top && overridden[1] === top[1], 'an edge\'s own side beats the default',
      `own-side label at y=${overridden && overridden[1]}, plain side top at y=${top && top[1]}`);
  }
  {
    const box = (def, own) => {
      const out = fig(`a chevron ${def || 'with no default'}`,
        (def ? def + '\n' : '') + `box a "A" at 0,0 {.chevron}${own ? ' ' + own : ''}`);
      return out && attrOf(out, 'a--r', 'd');
    };
    const up = box('default box point up');
    const down = box('default box point down');
    ok(up && down && up !== down, 'default box point aims the outline',
      'the two paths are identical');
    const overridden = box('default box point up', 'point down');
    ok(overridden && overridden === down, 'a box\'s own point beats the default',
      'the default won');
  }


  // ── a label wider than the room between the things it joins ───────
  // The compiler knows the label's width and knows the gap, and until this
  // check it compared them nowhere. The tutorial shipped the consequence: at
  // On a 126x38 grid three boxes at `gap 1.05` leave 40 px of clear paper and
  // the word `encrypted` measures 71, so the room read `crypte` – a clean
  // build, a clean lint and a broken slide.
  //
  // Every assertion here is about what the *drawing* means rather than about
  // the warning's wording: the fixture that warns and the fixture that does
  // not differ by exactly one token, and the token is the one an author would
  // change. There is no browser in it, which is why it is a gate: the two
  // numbers being compared are the compiler's own.
  {
    const clipped = (what, body, head = 'unit=126x38') => {
      const r = render(body, head);
      if (!r.ok) { ok(false, `${what} compiles`, r.msg.split('\n')[0]); return null; }
      return r.warns.filter(w => /the room reads a clipped word/.test(w));
    };
    const ROW = (gap, label) => 'box src "Sender"\n'
      + `box mix "Mix" right of src gap ${gap}\n`
      + `edge src -> mix "${label}"`;

    const tight = clipped("the tutorial's own row of boxes", ROW('1.05', 'encrypted'));
    ok(tight && tight.length === 1, 'a label wider than the gap between its two boxes is reported',
      tight ? `${tight.length} warning(s)` : 'did not compile');
    // The numbers are the fix, so the message has to carry them: the width of
    // the words and the paper there was for them.
    ok(tight && tight.length === 1
      && /\b71 px across\b/.test(tight[0]) && /\b40 px of clear space\b/.test(tight[0]),
      "and it states both numbers - the label's width and the room it had",
      tight && tight[0]);

    // One token apart, in both directions. A wider gap is the fix an author
    // reaches for; a shorter label is the other one.
    const wider = clipped('the same row at a wider gap', ROW('2.6', 'encrypted'));
    ok(wider && wider.length === 0, 'the same row with a wider gap is silent',
      wider && wider[0]);
    const shorter = clipped('the same row with a short label', ROW('1.05', 'e'));
    ok(shorter && shorter.length === 0, 'the same gap with a label that fits is silent',
      shorter && shorter[0]);

    // "The space it has" is not the gap alone. `side top` lifts the words off
    // the line, and where the two elements are short enough to pass under
    // them the width constrains nothing - a width test alone calls this a
    // defect, and it is the commonest correct figure in the corpus.
    const SIDE = (h) => `box a "A" at 0,0 w 0.6 h ${h}\n`
      + 'box b "B" right of a gap 0.6 same as a\n'
      + 'edge a -> b "a long phrase here" side top';
    const shortEnds = clipped('a side top label over short elements', SIDE('0.3'));
    ok(shortEnds && shortEnds.length === 0,
      'a side top label that clears the elements at either end is silent',
      shortEnds && shortEnds[0]);
    const tallEnds = clipped('a side top label over tall elements', SIDE('1.6'));
    ok(tallEnds && tallEnds.length === 1,
      'and the same label is reported where they are tall enough to paint over it',
      'a side is not by itself an escape from the geometry');

    // On an elbow the label sits on the rail, which is halfway across the gap
    // and clear of both ends - the same distinction between the drawn run and
    // the exposed one that the label-ground check is built on.
    const rail = clipped('an elbow label on its rail',
      'box a "A" at 0,0\nbox b "B" below a gap 1.2\nedge a -- b "on the rail" {.elbow}');
    ok(rail && rail.length === 0,
      "an elbow's label sits on the rail, so it is not compared with the ends",
      rail && rail[0]);

    // `.front` draws the line and its label over the boxes, so nothing is
    // painted on top of them and there is nothing to report.
    const front = clipped('the tutorial row written .front', ROW('1.05', 'encrypted') + ' {.front}');
    ok(front && front.length === 0,
      'a .front edge is exempt - it is drawn over the boxes, not under them',
      front && front[0]);

    // A `sequence` message ends on a coordinate rather than on an element, so
    // a label crossing a lifeline - which is what a lifeline is for, and why a
    // message carries a ground by default - is never compared with one.
    const seq = clipped('a long sequence message',
      'sequence s at 0,0\n  actor a "A"\n  actor b "B"\n  a -> b "a very long message label indeed"', '');
    ok(seq && seq.length === 0,
      'a sequence message is never reported - its ends are coordinates, not elements',
      seq && seq[0]);

    // The axis is the one the label runs along, not the page's. A turned
    // label between two stacked boxes is measured up and down.
    const vert = clipped('a turned label between two stacked boxes',
      'box a "A" at 0,0\nbox b "B" below a gap 0.4\nedge a -> b "turned label here" {.turn}');
    ok(vert && vert.length === 1 && /px of clear space between a and b/.test(vert[0]),
      'a turned label on a vertical edge is measured on the vertical axis',
      vert && (vert[0] || 'nothing was reported'));
  }

  // ── prominence is one slot, and it reaches every member of a set the
  //    compiler itself mixed ──────────────────────────────────────────
  // The kind list was widened so that `emph @wa-msg-N` works: `sequence`
  // generates that tag holding an edge, a number and an optional second line,
  // and a `{@t}` written once on a `grid` line is spread over a frame and its
  // image cells. Accepting the line is not the claim - the claim is that every
  // member ends the beat carrying the class, which is what makes the set one
  // act rather than one act and some silence.
  {
    const out = fig('a message tag emphasised',
      SEQ(AB + '  a -> b "M" "second line"\n') + '\nstep s\n  emph @s-msg-0');
    if (out) {
      const fr = frames(out);
      const at1 = fr && fr.frames && fr.frames[1] && fr.frames[1].cls;
      for (const part of ['s-0', 's-n-0', 's-sub-0']) {
        const got = at1 && at1[part];
        ok(typeof got === 'string' && got.split(/\s+/).includes('emph'),
          `emph @s-msg-0 reaches ${part}`, `beat 1 class was ${JSON.stringify(got)}`);
      }
    }
  }
  {
    // The three words share one slot, so `emph` on a picture is not inert: it
    // displaces the `dim` that was there. This is the whole of what emphasis
    // means on a kind with no ink of its own, and it is why the kind list is
    // one list.
    const out = fig('emph after dim on an image',
      'image i pic "P" w 1 {.dim}\nbox b "B" below i gap 1\nstep s\n  emph i');
    const fr = out && frames(out);
    const a = fr && fr.frames[0] && fr.frames[0].cls && fr.frames[0].cls.i;
    const b = fr && fr.frames[1] && fr.frames[1].cls && fr.frames[1].cls.i;
    ok(/\bdim\b/.test(String(a)) && /\bemph\b/.test(String(b)) && !/\bdim\b/.test(String(b)),
      'emph displaces dim on an image rather than stacking with it',
      `opening ${JSON.stringify(a)}, beat 1 ${JSON.stringify(b)}`);
  }
  {
    // A free text carries the class in every spelling, which is the symmetry
    // the verb used to break: the class was refused and the verb accepted.
    const spellings = {
      'on its own line': 'text t "T" at 0,0 {.emph}\nbox b "B" below t gap 1',
      'through a style step': 'text t "T" at 0,0\nbox b "B" below t gap 1\nstep s\n  style t {.emph}',
      'through the verb': 'text t "T" at 0,0\nbox b "B" below t gap 1\nstep s\n  emph t',
    };
    for (const [how, body] of Object.entries(spellings)) {
      const out = fig(`emph on a text ${how}`, body);
      if (!out) continue;
      const last = body.includes('step') ? (frames(out).frames[1].cls || {}).t : clsOf(out, 't');
      ok(String(last).split(/\s+/).includes('emph'), `a text takes emph ${how}`,
        `class was ${JSON.stringify(last)}`);
    }
  }

  // ── visibility runs downhill, and it chains ──────────────────────
  // "An arrow is only as visible as the two things it joins, a container or a
  // brace only as visible as its members, and a text with a line drawn to
  // something only as visible as what it points at." Three faces of one rule,
  // and the third one used to hold only where the leader pointed at a *node*:
  // the closure read the visibility the steps wrote and never the visibility
  // it had itself derived, so a leader aimed at an edge saw that edge's
  // untouched `true`. The tutorial states the rule on the very slide that
  // broke it – `#diagram-beats` opened with an annotation and a stub hanging
  // in empty paper, one beat before the logfile they annotate exists.
  //
  // Read off the per-beat payload rather than the SVG: opacity per beat is
  // what the runtime sets, and it is compiled, so no browser is needed to ask.
  const visAt = (out, k) => (frames(out) || { frames: [] }).frames[k] || {};
  {
    const out = fig('the tutorial\'s stepped annotation',
      'box  mix  "Mixnode"  at 0,0\n'
      + 'box  log  "Logfile"    below mix gap 0.9  {.dashed}\n'
      + 'edge leak mix -> log {.dashed}\n'
      + 'text why "this is where the anonymity ends"  right of log gap 1.4 -- leak {.hand}\n'
      + '\nstep leak\n  show log\nstep blame\n  emph leak, log');
    if (out) {
      const v0 = visAt(out, 0).vis || {}, v1 = visAt(out, 1).vis || {};
      ok(v0.log === 0 && v0.leak === 0, 'the hidden box takes its own edge with it',
        `log ${v0.log}, leak ${v0.leak}`);
      ok(v0.why === 0, 'a text whose leader points at a hidden edge is hidden too',
        `the annotation was at opacity ${v0.why} while its subject was at ${v0.leak}`);
      ok(v0['why--lead'] === 0, 'and so is the leader stub it grew',
        `the stub was at opacity ${v0['why--lead']}`);
      ok(v1.why === 1 && v1['why--lead'] === 1 && v1.log === 1,
        'both come back with the thing they annotate',
        `at beat 1: text ${v1.why}, stub ${v1['why--lead']}, box ${v1.log}`);
    }
  }
  {
    // The face that always worked, kept as the control: a leader aimed
    // straight at a node. If this one ever goes dark the closure has stopped
    // running rather than started chaining.
    const out = fig('a leader aimed at a node',
      'box a "A" at 0,0\nbox b "B" right of a gap 1\ntext t "note" below b gap 1 -- b\nstep s\n  show b');
    const v0 = out && (visAt(out, 0).vis || {});
    ok(v0 && v0.t === 0 && v0['t--lead'] === 0, 'a leader aimed at a hidden node hides its text',
      `text ${v0 && v0.t}, stub ${v0 && v0['t--lead']}`);
  }
  {
    // It is a default, not a law: an author who says `show` by name owns the
    // answer, which is what `visExplicit` is for.
    const out = fig('a shown text with a hidden subject',
      'box a "A" at 0,0\nbox b "B" right of a gap 1\ntext t "note" below b gap 1 -- b\n'
      + 'step s\n  hide b\n  show t');
    const v1 = out && (visAt(out, 1).vis || {});
    ok(v1 && v1.b === 0 && v1.t === 1, 'an explicit show on the text overrides the leader rule',
      `box ${v1 && v1.b}, text ${v1 && v1.t}`);
  }
  {
    // The chain one link further, through the holder face: a container whose
    // only member is an edge that a hidden endpoint took away.
    const out = fig('a container holding one derived-hidden edge',
      'box a "A" at 0,0\nbox b "B" right of a gap 1\nbox c "C" below a gap 1\n'
      + 'edge e a -> b\ncontainer k over e "held" pad 0.2\nstep s\n  show b');
    const v0 = out && (visAt(out, 0).vis || {});
    ok(v0 && v0.e === 0 && v0.k === 0, 'a holder whose members are all derived-hidden goes with them',
      `edge ${v0 && v0.e}, container ${v0 && v0.k}`);
  }
  {
    // Two leaders pointing at each other is a cycle in the closure. Nothing in
    // the grammar forbids writing one, so the only requirement is that the
    // compiler answers at all – it does, because a round can only ever turn
    // visibility off and the iteration stops when a round changes nothing.
    const out = fig('two leaders pointing at each other',
      'box a "A" at 0,0\ntext p "P" right of a gap 1 -- q\ntext q "Q" below a gap 1 -- p\nstep s\n  show a');
    const v0 = out && (visAt(out, 0).vis || {});
    ok(v0 && v0.p === 1 && v0.q === 1, 'a leader cycle terminates instead of hanging the compiler',
      `p ${v0 && v0.p}, q ${v0 && v0.q}`);
  }

  // ── what the source means to a rewriter ──────────────────────────
  // A name is not a keyword. The span table used to find `w` by scanning the
  // line for the token, so an element *called* `w` was taken for the width
  // option and a panel edit spliced over the wrong token – on the reference
  // in another element's placement, and on the element's own name. Both signs
  // are here because they fail through different halves of the lookup.
  {
    const t = spans('box w "West" at 0,0\nbox e "East" right of w gap 1');
    const misW = t.spanOf('e', 'w');
    const own = t.spanOf('w', 'w');
    ok(!(misW && misW.present) && !(own && own.present),
      'spanOf never mistakes a name or a reference for an option keyword',
      `on the reference ${JSON.stringify(misW)}, on its own name ${JSON.stringify(own)}`);
  }

  // `key` is the one keyed option whose value is a string, so its span is
  // the quoted token when present and an insertion carrying the quotes when
  // not - the shape a label's absent span has, and the shape the editor's
  // data fields know how to write.
  {
    const t = spans('bars f "3,5" at 0,0 w 2 h 1 key "one"\nbars g "1,2" series of f');
    const has = t.spanOf('f', 'key'), not = t.spanOf('g', 'key');
    ok(has && has.present && has.value === 'one' && has.text === '"one"',
      'spanOf key is the quoted token, value unquoted and text as written',
      JSON.stringify(has));
    ok(not && !not.present && not.prefix === ' key "' && not.suffix === '"',
      'an absent key is an insertion that carries its own quotes',
      JSON.stringify(not));
  }

  note('four contracts, and this gate holds the third: what the compiler emitted, '
    + 'not whether it parsed');
}
