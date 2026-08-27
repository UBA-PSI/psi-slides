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
 */
import { frames, render } from './harness.mjs';

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

  note('four contracts, and this gate holds the third: what the compiler emitted, '
    + 'not whether it parsed');
}
