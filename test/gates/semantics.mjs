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
import { DG_THEMES, dgSpans, dgMeasure, dgTokenize,
  DG_LABEL_H, DG_GAP_JOINED, DG_HEAD, DG_FONT } from '../../diagram-core.mjs';

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


  // ── a gap is measured in labels, and its default clears an arrow ──
  // The default used to be 0.25 rows, and a row is whatever the opener says:
  // 5 px on a 20-row grid, 18 on a 72-row one. On the grid a real keynote used
  // it came out at 10 px against a 9 px arrowhead. So the number nobody writes
  // is now stated in the one ruler a drawing carries whatever its opener says
  // – the height of a base label – and it is 1.6 of them for a pair an `edge`
  // joins, which is the head plus as much shaft again.
  //
  // Every assertion below is a *difference* between two fixtures one token
  // apart, except the two that have to be literals: the whole claim is that a
  // particular number of pixels arrives, and a relative assertion cannot say
  // that the opener stopped deciding it.
  {
    const gapOf = (what, body, head = '') => {
      const out = fig(what, body, head);
      if (!out) return null;
      const ax = +attrOf(out, 'a--r', 'x'), aw = +attrOf(out, 'a--r', 'width');
      return +attrOf(out, 'b--r', 'x') - (ax + aw);
    };
    const PAIR = 'box a "A" at 0,0\nbox b "B" right of a';
    const small = gapOf('an unjoined pair on a 20-row grid', PAIR, 'unit=120x20');
    const large = gapOf('the same pair on a 72-row grid', PAIR, 'unit=120x72');
    ok(small != null && large != null && Math.abs(small - large) < 0.01,
      'the default gap is the same distance whatever the opener says',
      `${small} px on 120x20, ${large} px on 120x72`);
    ok(small != null && Math.abs(small - DG_LABEL_H) < 0.01,
      'and that distance is one base label',
      `${small} px against ${DG_LABEL_H}`);

    const joined = gapOf('a pair an edge joins', PAIR + '\nedge a -> b', 'unit=120x72');
    ok(joined != null && Math.abs(joined - DG_GAP_JOINED * DG_LABEL_H) < 0.01,
      'a pair an edge joins gets 1.6 labels instead – decided after the block is read',
      `${joined} px against ${DG_GAP_JOINED * DG_LABEL_H}`);
    ok(joined != null && joined - DG_HEAD >= DG_HEAD,
      'which leaves at least as much shaft as the arrowhead is long',
      `${joined} px of paper, ${DG_HEAD} px of head`);
    // The direction of the edge is not the point, and neither is which of the
    // two elements was placed against the other.
    const back = gapOf('the same pair joined the other way', PAIR + '\nedge b -> a', 'unit=120x72');
    ok(back != null && joined != null && Math.abs(back - joined) < 0.01,
      'and the edge counts whichever way round it is written', `${back} vs ${joined}`);

    // A written gap keeps its meaning and its unit. It is a number the author
    // tuned against the grid in the opener, and other elements are chained off
    // it – so it stays rows and it is never widened for you.
    const written = gapOf('a written gap', 'box a "A" at 0,0\nbox b "B" right of a gap 0.5',
      'unit=120x72');
    ok(written != null && Math.abs(written - 0.5 * 72) < 0.01,
      'a written gap is still a number of rows', `${written} px against 36`);
    const writtenJoined = gapOf('a written gap on a joined pair',
      'box a "A" at 0,0\nbox b "B" right of a gap 0.5\nedge a -> b', 'unit=120x72');
    ok(writtenJoined != null && Math.abs(writtenJoined - 0.5 * 72) < 0.01,
      'and an edge does not widen it', `${writtenJoined} px against 36`);

    // The default for a *labelled* edge holds the label as well, which is what
    // turns the clip warning below into a report about a number the author
    // wrote. Only across: a label on a vertical run stands beside the line.
    const labelled = gapOf('a pair joined by a labelled edge',
      PAIR + '\nedge a -> b "a long phrase"', 'unit=120x72');
    ok(labelled != null && joined != null && labelled > joined,
      "a labelled edge's default gap holds its label", `${labelled} vs ${joined}`);
    const down = (what, body) => {
      const out = fig(what, body, 'unit=120x72');
      if (!out) return null;
      const ay = +attrOf(out, 'a--r', 'y'), ah = +attrOf(out, 'a--r', 'height');
      return +attrOf(out, 'b--r', 'y') - (ay + ah);
    };
    const downPlain = down('a stacked pair an edge joins', 'box a "A" at 0,0\nbox b "B" below a\nedge a -> b');
    const downLabel = down('the same stack with a long edge label',
      'box a "A" at 0,0\nbox b "B" below a\nedge a -> b "a long phrase"');
    ok(downPlain != null && downLabel != null && Math.abs(downPlain - downLabel) < 0.01,
      'but a label on a vertical run does not, because it stands beside the line',
      `${downPlain} vs ${downLabel}`);

    // ── edge-short: the other half of the rule ──
    // A written gap is the author's number and is not pushed apart, so the
    // author hears about it instead. Measured on the exposed run, and one
    // token apart in both directions.
    const shorts = (what, body, head = 'unit=120x40') => {
      const r = render(body, head);
      if (!r.ok) { ok(false, `${what} compiles`, r.msg.split('\n')[0]); return null; }
      return r.warns.filter(w => /its exposed run is/.test(w));
    };
    const tightRow = shorts("a keynote's own row", 'box a "A" at 0,0\nbox b "B" right of a gap 0.3\nedge a -> b');
    ok(tightRow && tightRow.length === 1, 'an arrow with almost no shaft is reported',
      tightRow ? tightRow.join(' | ') : 'did not compile');
    ok(tightRow && tightRow.length === 1 && /\b12 px\b/.test(tightRow[0])
      && /0\.64 labels/.test(tightRow[0]) && /more rows of gap/.test(tightRow[0]),
      'and it states the run in px and in labels, and the number that would clear it',
      tightRow && tightRow[0]);
    const roomy = shorts('the same row at a wider gap',
      'box a "A" at 0,0\nbox b "B" right of a gap 0.8\nedge a -> b');
    ok(roomy && roomy.length === 0, 'a row with room for the arrow is silent', roomy && roomy[0]);
    const defaulted = shorts('the same row with no written gap',
      'box a "A" at 0,0\nbox b "B" right of a\nedge a -> b');
    ok(defaulted && defaulted.length === 0,
      'and the default never trips it – 1.6 labels stands clear of 1.5',
      defaulted && defaulted[0]);
    // A leader stub is `--`, which draws no head; a short plain connector is a
    // tick joining two things and is what a leader is for.
    const leader = shorts('a short leader stub',
      'box a "A" at 0,0\nbox b "B" right of a gap 0.3\nedge a -- b');
    ok(leader && leader.length === 0, 'a headless edge has no head to crowd, so it is exempt',
      leader && leader[0]);
    // A `sequence` message is placed by the statement that made it, and the
    // fix this warning names is not a line the author has.
    const synth = shorts('a sequence of two actors',
      'sequence s at 0,0 space 0.1\n  actor a "A"\n  actor b "B"\n  a -> b "M"', '');
    ok(synth && synth.length === 0, 'a synthesised edge is exempt', synth && synth[0]);
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

  // ── .left on a free text at a coordinate anchors it ───────────────
  // The class used to align the lines *inside* the text's own box while the
  // box stayed centred on its `at`, so on a one-line label it moved nothing at
  // all and on a longer one it put the edge the class names half a label width
  // from the point the author aimed at. Two warnings existed for nothing but
  // that trap, `dgLabelAnchorWarnings` here and `diagram-ragged-labels` in
  // lint.js, and both are retired: the geometry they detected cannot arise.
  //
  // Every assertion but two is a *difference* between two fixtures one token
  // apart. Those two are absolute for a reason: the claim is that the box's
  // own edge lands on the coordinate, which is a statement about a position
  // rather than about a shift.
  {
    // **Measured on the ink**, which is the only number that answers the
    // promise. A free `text` draws no rect, and the label wrapper alone cannot
    // tell the two cases apart: a centred label and an anchored one both
    // translate their wrapper to the coordinate, and what differs is the
    // `text-anchor` the glyphs then run from. So the reader's left edge is the
    // wrapper plus what that anchor does with the measured width, and the two
    // halves compose exactly as a browser composes them.
    const PHRASE = 'a long phrase indeed';
    const inkOf = (what, body, head = '') => {
      const out = fig(what, body, head);
      if (!out) return null;
      const at = labelAt(out, 'l');
      const m = out.match(new RegExp(`id="${P}l--l0"[^>]*>\\s*<text text-anchor="([a-z]+)"`));
      if (!at || !m) return null;
      const w = dgMeasure(PHRASE, DG_FONT, false).w;
      const l = at[0] + (m[1] === 'start' ? 0 : m[1] === 'end' ? -w : -w / 2);
      const z = +attrOf(out, 'z--r', 'x');
      return { left: l - z, right: l + w - z, w };
    };
    const edges = inkOf;
    const BOX = 'box z "" at 0,0 w 3 h 2 {.dashed .clear}\n';
    const AT = (tail) => BOX + `text l "${PHRASE}" at z.left,z.cy ${tail}`;

    const plain = edges('a centred label on a box edge', AT('{}'));
    const left = edges('the same label written .left', AT('{.left}'));
    ok(left && Math.abs(left.left) < 0.01,
      '.left puts the text box’s own left edge on the coordinate',
      left ? `left edge at ${left.left.toFixed(2)} px from z.left` : 'not drawn');
    ok(plain && Math.abs(plain.left + plain.w / 2) < 0.01,
      'where a label with no such class is still centred on it',
      plain ? `left edge at ${plain.left.toFixed(2)}, half width ${(plain.w / 2).toFixed(2)}` : 'not drawn');
    const right = edges('the same label written .right', AT('{.right}'));
    ok(right && Math.abs(right.right) < 0.01,
      'and .right puts its right edge there',
      right ? `right edge at ${right.right.toFixed(2)} px from z.left` : 'not drawn');

    // A written anchor is the author's answer whatever it says, and
    // `anchor center` is how the old centring is spelled out.
    const centred = edges('the same line with anchor center', AT('anchor center {.left}'));
    ok(centred && plain && Math.abs(centred.left - plain.left) < 0.01,
      'anchor center draws what a label with no alignment class draws',
      centred && plain ? `${centred.left.toFixed(2)} vs ${plain.left.toFixed(2)}` : 'not drawn');
    const tr = edges('the same line with anchor tr', AT('anchor tr {.left}'));
    ok(tr && Math.abs(tr.right) < 0.01,
      'and any other written anchor still wins over the class',
      tr ? `right edge at ${tr.right.toFixed(2)}` : 'not drawn');

    // Three bounds, each a figure the corpus contains. A turned label is
    // centred whichever way it reads; a relative placement answers the same
    // question with `flush`; and on a box the class ranges the label inside an
    // outline that has its own position.
    const turned = edges('a turned .left label', AT('{.left .turn}'));
    const turnedPlain = edges('the same turned label with no class', AT('{.turn}'));
    ok(turned && turnedPlain && Math.abs(turned.left - turnedPlain.left) < 0.01,
      'a .turn ed label is centred whichever way it reads', 'the turn was moved');
    const relRef = (tail) => {
      const r = inkOf('a .left label placed relationally', BOX
        + `text l "${PHRASE}" below z gap 0.5 ${tail}`);
      return r ? r.left : null;
    };
    ok(Math.abs(relRef('{.left}') - relRef('{}')) < 0.01,
      'a relative placement is untouched – flush is its answer to this question',
      `${relRef('{.left}')} vs ${relRef('{}')}`);
    const boxRef = (tail) => {
      const out = fig('a .left box at a coordinate',
        `box b "${PHRASE}" at 0,0 ${tail}`);
      return out ? +attrOf(out, 'b--r', 'x') : null;
    };
    ok(Math.abs(boxRef('{.left}') - boxRef('{}')) < 0.01,
      'and a box is untouched – there the class ranges the label inside the outline',
      `${boxRef('{.left}')} vs ${boxRef('{}')}`);

    // The compiler warning the rule replaced. It may not survive: a warning
    // about geometry that cannot arise is a warning nobody can act on.
    const gone = render(AT('{.left}')).warns
      .filter((w) => /with no anchor the box is centred/.test(w));
    ok(gone.length === 0, 'dgLabelAnchorWarnings is retired with the trap it named',
      gone.join(' | '));
  }


  // ── emph acts on what the element actually draws ──────────────────
  // `emph` lives in the prominence slot and `.bare` in the stroke-weight
  // slot, so neither may overwrite the other – and the stylesheet used to let
  // it: `.emph` sets an accent stroke at the same specificity as `.bare`'s
  // `stroke: none` and later in source order, so a lit cell in a table of
  // type on the paper came back as a red empty rectangle. Two halves, and
  // they need two different gates: the compiler decides that both classes are
  // on the element, and the stylesheet decides what the pair then means.
  {
    const TABLE = 'table t "a | b" at 0,0 col 1,1 row 0.5 {.bare .clear}\n"x | y"\n';
    const out = fig('a bare cell emphasised by a step', TABLE + '\nstep lit\n  emph t-0-1');
    if (out) {
      const fr = frames(out);
      const at1 = fr && fr.frames && fr.frames[1] && fr.frames[1].cls;
      const cls = at1 && at1['t-0-1'];
      const set = new Set(String(cls || '').split(/\s+/).filter(Boolean));
      ok(set.has('emph') && set.has('bare'),
        'a step\'s emph leaves .bare on the element rather than displacing it',
        `beat 1 class was ${JSON.stringify(cls)}`);
    }
    const stat = fig('a bare cell emphasised on its own line',
      'box b "B" at 0,0 {.bare .emph}');
    const sc = stat && setOf(stat, 'b');
    ok(sc && sc.has('emph') && sc.has('bare'),
      'and the two classes coexist when both are written on the line',
      sc ? [...sc].join(' ') : 'b was not drawn');

    // The stylesheet half. Both rules exist, the one that keeps the outline
    // off is the more specific of the two, and it is written after the
    // .tone-4.emph rule it ties with – so a cell carrying all three is still
    // un-stroked. Read as text, because what it asserts is source order.
    const css = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
    const emphAt = css.indexOf('.psi-diagram .emph > :is(rect, circle, .dg-shape)');
    const bareAt = css.indexOf('.psi-diagram .bare.emph > :is(rect, circle, .dg-shape) { stroke: none; }');
    const toneAt = css.indexOf('.psi-diagram .tone-4.emph > :is(rect, circle, .dg-shape)');
    ok(bareAt > 0, 'the stylesheet says emph draws no outline on a .bare element',
      'no .bare.emph rule in build.js');
    ok(bareAt > emphAt && emphAt > 0 && bareAt > toneAt && toneAt > 0,
      'and it is written after both rules it has to beat, which is what settles the tie',
      `emph ${emphAt}, tone-4.emph ${toneAt}, bare.emph ${bareAt}`);
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

  // ── what a marker in a label means ───────────────────────────────
  // `_` and `^` take the next character, which made every snake_case
  // identifier unwritable: `scan_page` drew as `scan`, a subscript `p` and
  // `age`, silently, with a clean lint and a box measured to fit exactly the
  // wrong reading. The escape covers all four markers and the backslash so
  // that it has no exception of its own, and **a shift marker in the middle
  // of a word is now a literal character** – the same fallback `*` and `~`
  // already had, so an author who writes a filename gets a filename without
  // having to know the grammar. Both halves are asserted here, and so is the
  // line between them: every subscript the corpus actually contains still
  // shifts.
  {
    const one = (s) => dgSpans(s).map(sp => `${sp.t}|${sp.shift}|${sp.cls}`).join(' + ');
    const cases = [
      // written, spans as text|shift|class - both signs of every marker.
      ['scan\\_page', 'scan_page|0|', 'an escaped underscore is one literal span'],
      ['scan_page', 'scan_page|0|', 'and an unescaped one mid-word is literal too'],
      ['hausarbeit_final.pdf', 'hausarbeit_final.pdf|0|', 'the filename the defect was found on'],
      ['snake_case_name', 'snake_case_name|0|', 'an underscore is a word character, so a chain of them stays literal'],
      ['c_0', 'c|0| + 0|-1|', 'c_0 still subscripts: the character it takes ends the word'],
      ['MAC_k(M)', 'MAC|0| + k|-1| + (M)|0|', 'and so does a subscript before a bracket'],
      ['M_F, T_F', 'M|0| + F|-1| + , T|0| + F|-1|', 'and before a comma, and at the end'],
      ['k_{12}', 'k|0| + 12|-1|', 'a group shifts wherever it is written, mid-word or not'],
      ['a\\_b', 'a_b|0|', 'the escape is still how a one-character case is forced literal'],
      ['x\\^2', 'x^2|0|', 'an escaped caret is one literal span'],
      ['x^2', 'x|0| + 2|1|', 'an unescaped caret still superscripts'],
      ['x^2y', 'x^2y|0|', 'but not in the middle of a word'],
      ['x_1^2', 'x|0| + 1|-1| + 2|1|', 'a marker is not a word character, so a subscript may meet a superscript'],
      ['a\\*b*', 'a*b*|0|', 'an escaped asterisk is literal and is no partner for a later one'],
      ['*a*', 'a|0|em', 'an unescaped pair still accents'],
      ['a\\~b~', 'a~b~|0|', 'an escaped tilde is literal and is no partner for a later one'],
      ['~a~', 'a|0|mu', 'an unescaped pair still mutes'],
      ['a\\\\b', 'a\\b|0|', 'a doubled backslash is one backslash'],
      ['C:\\path', 'C:\\path|0|', 'a backslash before anything else stays a backslash'],
      ['ends with\\', 'ends with\\|0|', 'a trailing lone backslash is a backslash, not a swallowed escape'],
      ['\\_\\_init\\_\\_', '__init__|0|', 'the identifier the defect was found on'],
      ['c_{i\\_j}', 'c|0| + i_j|-1|', 'the escape holds inside a braced group too'],
    ];
    for (const [src, want, why] of cases) {
      const got = one(src);
      ok(got === want, `${why} (${JSON.stringify(src)})`, `drew ${got}`);
    }
  }

  // The escape is consumed in `dgSpans`, which `dgMeasure` reads the label
  // through, so it never reaches a measured string. Handled at the emitter
  // instead it would widen every box carrying one - by a whole character,
  // which on a tight row is a box that no longer fits its neighbours.
  {
    // The control is nine characters of the same advance class, so the two
    // numbers are comparable without pinning the estimate to a literal.
    const escaped = dgMeasure('scan\\_page', 15, false).w;
    const plain = dgMeasure('scanxpage', 15, false).w;
    const wrong = dgMeasure('scan\\xpage', 15, false).w;
    ok(Math.abs(escaped - plain) < 0.01 && wrong > escaped,
      'an escape costs no width: scan\\_page measures as nine characters',
      `escaped ${escaped.toFixed(2)}, nine plain ${plain.toFixed(2)}, ten ${wrong.toFixed(2)}`);
  }

  // And the same thing read off the drawing: one tspan, one underscore, no
  // font-size of its own. The span table is what the compiler decided; this
  // is what a reader would see.
  {
    const out = fig('a label with an escaped underscore', 'box b "scan\\_page" at 0,0');
    const m = out && out.match(/<text[^>]*>([\s\S]*?)<\/text>/);
    const inner = m ? m[1] : '';
    ok(/^<tspan x="0"[^>]*>scan_page<\/tspan>$/.test(inner),
      'the emitted label is a single tspan carrying the underscore',
      inner || 'no text element was drawn');
  }

  // It takes two layers to get there, and the other one has to keep its own
  // two sequences: `dgTokenize` hands `\_` on whole but still decodes `\n`
  // into a line break, which is how every multi-line label in the corpus is
  // written.
  {
    const out = fig('a label broken with a backslash-n', 'box b "two\\nlines" at 0,0');
    const n = out ? (out.match(/<tspan x="0"/g) || []).length : 0;
    ok(n === 2, 'a label still breaks its lines at \\n', `${n} line(s) drawn`);
  }

  // ── anchor: which point of the element meets the coordinate ───────
  // The defect it repaired was a row of labels that is not a row: `.left`
  // aligned the lines inside each free text's own box while the box stayed
  // centred on its coordinate, so two labels of different lengths at one x
  // started at two different left edges. That case is now the *default* – see
  // the `.left` block above – and `anchor left` is the same statement written
  // out. What this block holds is the option itself: every one of the nine
  // words, on a placement whose class does not already decide it, and the
  // carry-forward through a step. Every assertion is about the *drawn*
  // geometry, and the two lengths differ by design.
  {
    const ROW = (tail) => 'box z "Z" at 0,0 w 3 h 2\n'
      + `text a "short" at z.left,z.top ${tail}\n`
      + `text b "a much longer line" at z.left,z.top ${tail}`;
    // A free text with no fill draws no ground, so the position is on the
    // label wrapper's own transform – which is also where the runtime tweens
    // it, so it is the number a reader sees.
    const boxOf = (body, id) => {
      const r = render(body);
      if (!r.ok) return null;
      const m = r.out.match(new RegExp(`id="dg1-${id}--lw0"[^>]*transform="translate\\((-?[\\d.]+),(-?[\\d.]+)\\)"`));
      return m ? { x: +m[1], y: +m[2] } : null;
    };
    const plain = { a: boxOf(ROW('{.left}'), 'a'), b: boxOf(ROW('{.left}'), 'b') };
    ok(plain.a && plain.b && Math.abs(plain.a.x - plain.b.x) < 0.01,
      'two .left labels of different lengths now share a left edge with no anchor written',
      plain.a && plain.b ? `${plain.a.x} vs ${plain.b.x}` : 'did not draw');
    // What `boxOf` reads is the label wrapper, which is the *anchor point* of
    // the glyph run and so already carries `text-anchor`. That is the right
    // ruler for a row written the same way twice – the question is whether two
    // such labels start at one x – and the wrong one for comparing a ranged
    // label with a centred one, which is the ink measurement the `.left` block
    // above makes instead.
    const anch = { a: boxOf(ROW('anchor left {.left}'), 'a'), b: boxOf(ROW('anchor left {.left}'), 'b') };
    ok(anch.a && anch.b && Math.abs(anch.a.x - anch.b.x) < 0.01,
      'anchor left puts both of them on one left edge',
      anch.a && anch.b ? `${anch.a.x} vs ${anch.b.x}` : 'did not draw');
    // Down as well as across, and the two corners are not the same corner.
    const tl = boxOf(ROW('anchor tl {.left}'), 'a');
    const bl = boxOf(ROW('anchor bl {.left}'), 'a');
    ok(tl && bl && Math.abs(tl.x - bl.x) < 0.01 && tl.y > bl.y,
      'anchor tl hangs the element below the point, anchor bl stands it above, '
      + 'and both share the left edge',
      tl && bl ? `tl ${tl.x},${tl.y} bl ${bl.x},${bl.y}` : 'did not draw');
    // `center` is the default written out, so it has to draw what no word draws.
    const bare = boxOf(ROW(''), 'b');
    const centred = boxOf(ROW('anchor center'), 'b');
    ok(bare && centred && Math.abs(bare.x - centred.x) < 0.01 && Math.abs(bare.y - centred.y) < 0.01,
      'anchor center draws what leaving the word off draws',
      bare && centred ? `${bare.x},${bare.y} vs ${centred.x},${centred.y}` : 'did not draw');
    // And the element the compiler places by a corner keeps that corner when a
    // step moves it: `anchor` says how it meets a coordinate, `move … to` says
    // which coordinate, and a step answering both re-centres it silently.
    const MOVED = 'box a "A" at 0,0 anchor tl w 2 h 1\nbox p "P" at 4,4\nstep s\n  move a to 3,3';
    const f = frames(render(MOVED).out);
    const g = f && f.frames && f.frames[1] && f.frames[1].geom && f.frames[1].geom['a--r'];
    ok(!!g && Math.abs(g[0] - 3 * 120) < 0.01 && Math.abs(g[1] - 3 * 72) < 0.01,
      'a move keeps the element on its own anchor', g ? g.join(',') : '(no frame)');
  }

  // ── a relabelled text keeps the edge its placement pinned ─────────
  // A free text is as wide as its glyph run, so `anchor tl`, `right of x`,
  // `flush left` and `align x left` each put one of its own sides on a
  // coordinate exactly – and that width is an **estimate**. Drawing the words
  // centred on the box's estimated middle therefore split the error between
  // the two sides and put half of it on the side the author pinned. A `label`
  // step swapping in a longer string changed that half, and the words moved
  // sideways although nothing in the source moved them: measured on a keynote
  // whose zone caption went from "im Raum" to "im Raum · 3 Stunden, ohne
  // Internet", 11 px to the right.
  //
  // Two questions, and they need two rulers. **Where the origin is** is the
  // frame payload, which is what the runtime tweens between; **which edge that
  // origin is** is the `text-anchor` the emitter baked. A fixed origin under
  // `middle` is a fixed centre, which is the right answer for a text placed by
  // its centre and the wrong one for a text placed by its corner – so neither
  // number means anything without the other.
  {
    const SHORT = 'im Raum', LONG = 'im Raum, drei Stunden, ohne Internet';
    // The `--l` origin in each frame, and the anchor the glyphs run from.
    const swap = (body, id, head = 'unit=120x40') => {
      const r = render(body, head);
      if (!r.ok) return { msg: r.msg.split('\n').slice(0, 2).join(' / ') };
      const f = frames(r.out);
      const m = r.out.match(new RegExp(`id="dg1-${id}--lw0"[\\s\\S]{0,400}?text-anchor="([a-z]+)"`));
      if (!f || !m) return { msg: 'no payload or no label' };
      return { xs: f.frames.map(fr => (fr.geom[id + '--l'] || [])[0]), anchor: m[1] };
    };
    const held = (s) => s.xs && s.xs.every(x => Math.abs(x - s.xs[0]) < 0.01);
    const ZONE = (tail) => `zone z at 0,0 w 3 h 2 "${SHORT}" ${tail}\n`
      + `box a "A" at z.cx,z.cy w 1 h 0.5\nstep s\n  label z-cap "${LONG}"`;
    const tl = swap(ZONE(''), 'z-cap');
    ok(tl.anchor === 'start' && held(tl),
      "a zone caption's words start on the corner it is anchored to, before and after a label step",
      tl.msg || `${tl.anchor} at ${(tl.xs || []).join(' / ')}`);
    const tr = swap(ZONE('{.right}'), 'z-cap');
    ok(tr.anchor === 'end' && held(tr),
      'and a .right caption ends on its own corner, which is the same rule the other way round',
      tr.msg || `${tr.anchor} at ${(tr.xs || []).join(' / ')}`);
    // The four placements that pin one of the element's own sides, and the two
    // that pin its centre. Written as a table because the claim is that one
    // sentence covers all six, and a case tested on its own is a case that can
    // quietly stop being covered by it.
    const PINNED = [
      ['anchor tl', `text l "${SHORT}" at 1,1 anchor tl`, 'start'],
      ['anchor br', `text l "${SHORT}" at 1,1 anchor br`, 'end'],
      ['right of', `box r "R" at 0,0\ntext l "${SHORT}" right of r gap 0.5`, 'start'],
      ['left of', `box r "R" at 4,0\ntext l "${SHORT}" left of r gap 0.5`, 'end'],
      ['flush left', `box r "R" at 0,0 w 3\ntext l "${SHORT}" below r gap 0.5 flush left`, 'start'],
      ['align x left', `box r "R" at 0,0 w 3\ntext l "${SHORT}" at 2,2\nalign x left r, l`, 'start'],
      ['a bare at', `text l "${SHORT}" at 1,1`, 'middle'],
      ['anchor center', `text l "${SHORT}" at 1,1 anchor center`, 'middle'],
    ];
    for (const [what, body, want] of PINNED) {
      const s = swap(`${body}\nbox z "Z" at 6,3\nstep s\n  label l "${LONG}"`, 'l');
      ok(s.anchor === want && held(s),
        `${what} draws its words from the ${want === 'middle' ? 'centre' : want} and holds it across a label step`,
        s.msg || `${s.anchor} at ${(s.xs || []).join(' / ')}`);
    }
    // Two bounds on the rule, and each is a figure the corpus contains. A
    // **box** is untouched: its words are centred inside an outline that is
    // drawn and that moves with the estimate, so the pair stays coherent and
    // ranging them left would be the `.left` the author did not write. And a
    // text given an explicit `w` is wider than its own label, where "as far
    // left as the box allows" is a different sentence with the same words.
    const boxed = swap(`box l "${SHORT}" at 1,1\nbox z "Z" at 6,3\nstep s\n  label l "${LONG}"`, 'l');
    ok(boxed.anchor === 'middle',
      "a box's label stays centred in the outline it is drawn inside",
      boxed.msg || boxed.anchor);
    const wide = swap(`text l "${SHORT}" at 1,1 anchor tl w 3\nbox z "Z" at 6,3\n`
      + `step s\n  label l "${LONG}"`, 'l');
    ok(wide.anchor === 'middle',
      'and a text given its own w is centred in that w, which is what .left is for',
      wide.msg || wide.anchor);
    // The written alignment class is the author's answer and outranks the
    // derived one, in the direction that can disagree: `.right` on a text
    // whose placement pins its left edge.
    const own = swap(`box r "R" at 0,0\ntext l "${SHORT}" right of r gap 0.5 {.right}\n`
      + `box z "Z" at 6,3\nstep s\n  label l "${LONG}"`, 'l');
    ok(own.anchor === 'end', 'a written .right still wins over the edge the placement pinned',
      own.msg || own.anchor);
  }

  // ── a table's first row, and how tall a row is ────────────────────
  // Two changes with one control each, and the control is the base case:
  // neither may move a table that says nothing new.
  {
    const T = (tail) => `table t "A|B" at 0,0 col 1,1 ${tail}\n  "1|2"\n  "3|4"`;
    const rowH = (out) => {
      const m = out.match(/id="dg1-t-0-0--r"[^>]*height="([\d.]+)"/);
      return m ? +m[1] : null;
    };
    const plain = fig('a plain table', T(''), 'unit=150x52');
    const bare = fig('an unheaded table', T('unheaded'), 'unit=150x52');
    const big = fig('a large table', T('{.large}'), 'unit=150x52');
    const said = fig('a large table with its own row', T('{.large} row 0.8'), 'unit=150x52');
    const h0 = plain && setOf(plain, 't-0-0'), h1 = plain && setOf(plain, 't-0-1');
    ok(h0 && h0.has('bold') && h1 && !h1.has('bold'),
      'the first row of a table is bold and the second is not',
      h0 ? [...h0].join(' ') : 'not drawn');
    const b0 = bare && setOf(bare, 't-0-0');
    ok(b0 && !b0.has('bold') && hasEl(bare, 't-1-0') && hasEl(bare, 't-0-1'),
      'unheaded takes the bold off and leaves every cell where it was',
      b0 ? [...b0].join(' ') : 'not drawn');
    ok(plain && bare && rowH(plain) === rowH(bare),
      'and it changes no height', `${rowH(plain)} vs ${rowH(bare)}`);
    ok(plain && big && rowH(big) > rowH(plain),
      'a .large table gets a taller row without being told one',
      `${rowH(plain)} vs ${rowH(big)}`);
    ok(said && Math.abs(rowH(said) - 0.8 * 52) < 0.01,
      "and the author's own row still wins over the derived one", String(rowH(said)));
    // The base case, stated as a number rather than as a comparison, because
    // this is the one assertion that keeps every table in the corpus still.
    ok(plain && Math.abs(rowH(plain) - 0.42 * 52) < 0.01,
      'a table with no size class draws exactly the row height it always did',
      String(rowH(plain)));
  }

  // ── flush meets ink, not an outline nobody draws ──────────────────
  // `.bare .clear` leaves a frame the layout still uses and a reader cannot
  // see. Lining a caption up with that edge put it a padding to the left of
  // the words it captioned, with nothing drawn at either coordinate to say
  // which one was the edge, and the ink correction the stylesheet reads
  // pointed at the same invisible line. Both halves are asserted here, and
  // each one against the control that has to stay still: an ordinary box,
  // whose outline *is* its edge, and a chart frame, whose parts sit flush
  // with it so insetting one would walk an axis label off its own axis.
  {
    const inkX = (out) => {
      const m = out.match(/--dg-ink-x:([\d.]+)/);
      return m ? +m[1] : null;
    };
    const vbW = (out) => {
      const m = out.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) /);
      return m ? +m[1] : null;
    };
    const bare = fig('a caption under a bare table',
      'table t "A|B" at 0,0 col 1,1 row 0.5 {.bare .clear .left}\n  "one|two"\n\n'
      + 'text c "caption" below t gap 0.4 flush left {.left}');
    const solid = fig('a caption under an ordinary box',
      'box b "B" at 0,0 w 2\ntext c "caption" below b gap 0.4 flush left {.left}');
    const cellX = bare && labelAt(bare, 't-0-0')[0];
    const capX = bare && labelAt(bare, 'c')[0];
    ok(bare && Math.abs(cellX - capX) < 0.01,
      'flush left under a bare table lands on the cell text, not on the invisible frame',
      `cell at ${cellX}, caption at ${capX}`);
    const bx = solid && +attrOf(solid, 'b--r', 'x');
    ok(solid && Math.abs(bx - labelAt(solid, 'c')[0]) < 0.01,
      'and against a box that draws its outline it still lands on the outline',
      `box at ${bx}, caption at ${solid && labelAt(solid, 'c')[0]}`);
    // The ink correction: the drawing starts where the paint starts.
    const tOnly = fig('a table alone',
      'table t "A|B" at 0,0 col 1,1 row 0.5 {.bare .clear .left}\n  "one|two"');
    const bOnly = fig('a box alone', 'box b "B" at 0,0 w 2');
    ok(tOnly && bOnly && inkX(tOnly) * vbW(tOnly) > inkX(bOnly) * vbW(bOnly) + 6,
      '--dg-ink-x skips a frame that draws neither outline nor fill',
      `table ${(inkX(tOnly) * vbW(tOnly)).toFixed(1)}px vs box ${(inkX(bOnly) * vbW(bOnly)).toFixed(1)}px`);
    // A bars frame is `.bare .clear` too and must NOT be inset: its baseline
    // and its columns are drawn flush with the frame, so a tick label held to
    // it by `flush left` belongs on the frame's own edge.
    const chart = fig('a caption under a chart',
      'bars f "3,4,5" at 0,0 w 2 h 1\ntext c "caption" below f gap 0.4 flush left {.left}');
    const fx = chart && +attrOf(chart, 'f--r', 'x');
    ok(chart && Math.abs(fx - labelAt(chart, 'c')[0]) < 0.01,
      "and a chart frame keeps its own edge, because a chart's parts start there",
      `frame at ${fx}, caption at ${chart && labelAt(chart, 'c')[0]}`);
  }

  // -- an endpoint in empty space -----------------------------------
  // `edge 0,1.5 -> mail` - an arrow that comes in from outside the picture
  // with no box behind it. A literal rather than an invisible anchor element,
  // so there is nothing to delete by accident and a drag rewrites two numbers.
  // It has been in `dgParseRef` from the start and in two lectures, and it was
  // in no document any author reads; these are the assertions that keep it.
  {
    const P1 = 'box mail "Posteingang" at 2,1.5\n';
    const into = fig('an edge from a free point', P1 + 'edge 0,1.5 -> mail');
    const d = into && attrOf(into, 'edge-1--p', 'd');
    const p = points(d);
    ok(p.length === 2 && p[0][0] === 0 && p[0][1] === p[1][1],
      'edge 0,1.5 -> mail starts at the coordinate and runs level into the box', d);
    ok(into && headDrawn(into, 'edge-1--h'),
      'and it still draws its arrowhead, on the box end');
    const out = fig('an edge to a free point', P1 + 'edge mail -> 0,1.5');
    const q = points(attrOf(out, 'edge-1--p', 'd'));
    ok(q.length === 2 && Math.abs(q[1][0]) < 12,
      'and the same pair written the other way round ends at that coordinate',
      attrOf(out, 'edge-1--p', 'd'));
    // A coordinate is the whole coordinate grammar, so a component may name
    // another element - which is how five edges in the corpus are written.
    const ref = fig('an endpoint naming another element',
      P1 + 'box b "B" at 0,0\nedge b -> mail.left-0.3,mail.cy');
    ok(ref && points(attrOf(ref, 'edge-1--p', 'd')).length === 2,
      'and a component of that coordinate may name an element');
    // Both ends free: nothing in the figure to hang the line on at all.
    const both = fig('a rule with two free ends', P1 + 'edge -0.4,0 -- 3,0 {.muted}');
    ok(both && points(attrOf(both, 'edge-1--p', 'd')).length === 2,
      'and both ends may be coordinates, which is how a rule under a row is drawn');
  }

  // -- a label its own line runs through -----------------------------
  // The offset that lifts a label off its line clears it at the midpoint and
  // knows nothing else about the route, so an elbow's outer runs and a
  // doubled-back curve can be drawn through the middle of the words. The
  // compiler decides it from the routed geometry and marks the beat; the
  // stylesheet turns dg-halo into a paint-order knockout.
  {
    const halo = (out) => (setOf(out, 'edge-1') || new Set()).has('dg-halo');
    const wide = fig('a straight edge with a long label',
      'box a "Bauen" at 0,0\nbox b "Code" at 0,2\nedge a -> b "alle Werkzeuge, auch KI"');
    ok(wide && !halo(wide),
      'a label correctly beside its own straight line needs no halo and does not get one',
      wide ? clsOf(wide, 'edge-1') : 'not drawn');
    const narrow = fig('an elbow whose own rail crosses its label',
      'box a "Bauen" at 0,0\nbox b "Code" at 0.5,1.6\nedge a -> b "alle Werkzeuge, auch KI" {.elbow}');
    ok(narrow && halo(narrow),
      'an elbow drawn through its own label gets the halo',
      narrow ? clsOf(narrow, 'edge-1') : 'not drawn');
    const curve = fig('a curve that comes back under its own label',
      'box a "Bauen" at 0,0\nbox b "Code" at 2.4,1.4\nedge a -> b "alle Werkzeuge" via 1.2,-0.8 {.smooth}');
    ok(curve && halo(curve), 'and so does a smooth route that crosses itself',
      curve ? clsOf(curve, 'edge-1') : 'not drawn');
    // A label the author already grounded is left alone: the ground is the
    // answer, and a halo under it would be a second one nobody asked for.
    const ground = fig('a grounded label on the same elbow',
      'box a "Bauen" at 0,0\nbox b "Code" at 0.5,1.6\n'
      + 'edge a -> b "alle Werkzeuge, auch KI" {.elbow .paper}');
    ok(ground && !halo(ground), 'a label that already carries a ground gets no halo',
      ground ? clsOf(ground, 'edge-1') : 'not drawn');
  }

  // -- an elbow rail lying on a box's side ---------------------------
  // The rail is halfway between the two faces and nothing moves it, so the
  // only thing the compiler can do is say so. The control is the same figure
  // with a gap in the row: the fix the message names has to silence it.
  {
    const row = (gap) => 'box b1 "One" at 0,0 w 1\n'
      + `box b2 "Two" right of b1 gap ${gap} w 1\n`
      + `box b3 "Three" right of b2 gap ${gap} w 1\n`
      + 'box src "Source" at b1.cx,-1.4 w 1\n'
      + 'box dst "Target" at 3,1.4 w 1\n'
      + 'edge src -> dst {.elbow}';
    const tight = render(row('0'), 'unit=120x72');
    const loose = render(row('0.6'), 'unit=120x72');
    const said = (r) => (r.warns || []).filter(w => /elbow rail/.test(w));
    ok(tight.ok && said(tight).length === 1 && /side of b2/.test(said(tight)[0]),
      'a rail lying on the seam of a row written gap 0 is named, with the box it lies on',
      said(tight)[0] || 'nothing said');
    ok(loose.ok && said(loose).length === 0,
      'and the gap the message asks for silences it',
      said(loose)[0] || '');
    // The bracket a tree is made of must stay quiet: the rail is halfway
    // between the two faces, so on any close pair it is near its own ends'
    // sides by arithmetic. Five corpus figures sat on exactly that.
    const bracket = render('box p "Parent" at 1,0 w 1.4\nbox c "Child" at 0,1 w 1.2\n'
      + 'edge p -> c {.elbow}', 'unit=120x72');
    ok(bracket.ok && said(bracket).length === 0,
      "and an edge's own two ends are exempt, or every tree bracket reports itself",
      said(bracket)[0] || '');
  }

  // ── zone: an area that is painted under what stands in it ─────────
  // Three things separate it from the `box {.dashed .clear}` plus `text` that
  // authors were writing, and each is asserted on the drawing rather than on
  // the parse: it is painted first whatever line it was written on, its
  // caption is in a corner rather than in the middle, and it is out of the
  // overlap census so a child standing in it is not a collision.
  {
    // Declared *after* the box it holds, which is the order an author writes
    // in – the area's size comes from its contents.
    const late = fig('a zone declared after its contents',
      'box a "A" at 0,0\nzone z at a.cx,a.cy w 3 h 2 "At home"');
    if (late) {
      const iz = late.indexOf('id="dg1-z"'), ia = late.indexOf('id="dg1-a"');
      ok(iz >= 0 && ia >= 0 && iz < ia, 'a zone is painted before what it holds, whatever line it is on',
        `zone at ${iz}, box at ${ia}`);
    }
    // The look is seeded and every part of it is displaceable through its own
    // slot – which is what makes it a look rather than a decision.
    const plain = fig('a plain zone', 'zone z at 0,0 w 3 h 2 "Z"\nbox a "A" at 4,0');
    const tinted = fig('a tinted zone', 'zone z at 0,0 w 3 h 2 "Z" {.tone-2 .dotted .accent}\nbox a "A" at 4,0');
    const pc = plain && setOf(plain, 'z'), tc = tinted && setOf(tinted, 'z');
    ok(pc && pc.has('clear') && pc.has('dashed') && pc.has('muted'),
      'a zone arrives see-through, dashed and muted', pc ? [...pc].join(' ') : 'not drawn');
    ok(tc && tc.has('tone-2') && tc.has('dotted') && tc.has('accent')
      && !tc.has('clear') && !tc.has('dashed') && !tc.has('muted'),
      'and each of the three is displaced by its own slot, not stacked with',
      tc ? [...tc].join(' ') : 'not drawn');
    // The caption's corner, read off where its label was drawn. The four words
    // are the element-label alignment classes one level out.
    const cap = (tail) => {
      const out = fig('a zone captioned ' + (tail || 'top left'),
        `zone z at 0,0 w 3 h 2 "Zone name" ${tail}\nbox a "A" at 4,0`);
      return out ? labelAt(out, 'z-cap') : null;
    };
    const tl = cap(''), br = cap('{.right .bottom}'), tr = cap('{.right}'), bl = cap('{.bottom}');
    ok(tl && br && tr && bl && tl[0] < 0 && br[0] > 0 && tl[1] < 0 && br[1] > 0,
      'the caption sits in the top-left by default and .right .bottom moves it across and down',
      JSON.stringify([tl, br]));
    ok(tr && bl && Math.abs(tr[0] - br[0]) < 0.01 && Math.abs(tr[1] - tl[1]) < 0.01
      && Math.abs(bl[0] - tl[0]) < 0.01 && Math.abs(bl[1] - br[1]) < 0.01,
      'and the two words act on one axis each', JSON.stringify([tr, bl]));
    // How far inside the corner. A third of a row, square in px on both axes,
    // and it was just under a sixth: an area's outline is a dashed line and
    // its caption is 12 px type, so at a sixth the words sat on the dashes.
    // Asserted as the distance from the corner rather than as a coordinate,
    // because the coordinate is the caption's anchored corner and the number
    // that matters is the clearance.
    {
      // Measured as a difference between two builds of one figure, because the
      // label's own origin carries half its measured box and that half is an
      // estimate. What the inset is, is the distance the caption moves.
      const inset = (tail) => {
        const out = fig('a zone captioned with ' + (tail || 'the default inset'),
          `zone z at 0,0 w 3 h 2 "Zone name" ${tail}\nbox a "A" at 5,0`, 'unit=120x72');
        const at = out && labelAt(out, 'z-cap');
        return at ? [at[0] - +attrOf(out, 'z--r', 'x'), at[1] - +attrOf(out, 'z--r', 'y')] : null;
      };
      const base = inset(''), wide = inset('pad 0.6');
      ok(base && wide && Math.abs((wide[0] - base[0]) - (wide[1] - base[1])) < 0.01,
        "a zone caption's inset is square in px, not in grid units",
        base && wide ? `${(wide[0] - base[0]).toFixed(2)} across, ${(wide[1] - base[1]).toFixed(2)} down` : 'not drawn');
      // `pad` was in DG_KIND_OPTS.zone from the start and read nothing at all,
      // which is the silent no-op this grammar refuses everywhere else.
      ok(base && wide && Math.abs((wide[1] - base[1]) - (0.6 - 0.33) * 72) < 0.01,
        'pad n on a zone is the caption inset, and the default it displaces is a third of a row',
        base && wide ? String(wide[1] - base[1]) : 'not drawn');
      const same = inset('pad 0.33');
      ok(base && same && Math.abs(same[1] - base[1]) < 0.01,
        'so writing the default out draws what leaving it off draws',
        base && same ? `${base[1]} vs ${same[1]}` : 'not drawn');
      // **And the bottom corner clears the outline by as much as the top one.**
      // Reported as a defect - a `.bottom` caption sitting on the line - and
      // measured to be one already, by the same commit that took the inset
      // from a sixth of a row to a third: it moved all four corners. What the
      // eye compares is the distance from the dashes to the nearest INK, and
      // the two are not the same distance from the label's box: the top clears
      // the outline by the inset plus the space over a cap, the bottom by the
      // inset plus the space under a baseline. Asserted on the ink, therefore,
      // with the glyph metrics the compiler itself typesets with, and in the
      // direction that was reported: the bottom may not be the tighter of the
      // two. Measured today at 26.6 px against 28.8 in a 120x72 grid.
      const clear = (tail) => {
        const out = fig('a zone caption clearing its corner ' + (tail || 'at the top'),
          `zone z at 0,0 w 3 h 2 "Zone name" ${tail}\nbox a "A" at 5,0`, 'unit=120x72');
        const at = out && labelAt(out, 'z-cap');
        if (!at) return null;
        // The label's baseline is font * 0.34 below its origin (dgTextEl), a
        // cap reaches about 0.72 of the font above that baseline, and a
        // descender about 0.21 below it. `.small` is 0.8 of DG_FONT.
        const f = 15 * 0.8;
        const top = +attrOf(out, 'z--r', 'y');
        const bottom = top + +attrOf(out, 'z--r', 'height');
        return tail.includes('bottom')
          ? bottom - (at[1] + f * 0.34 + f * 0.21)
          : (at[1] + f * 0.34 - f * 0.72) - top;
      };
      const ct = clear(''), cb = clear('{.bottom}');
      ok(ct != null && cb != null && cb >= ct - 0.01,
        'a .bottom caption clears the outline by at least as much as a top one',
        `${ct && ct.toFixed(1)} px at the top, ${cb && cb.toFixed(1)} px at the bottom`);
    }
    // Out of the overlap census, at both ends: the frame carries `synth` set
    // to its own id, the discriminator a table's and a lanes's frame already
    // use. A hand-built area drew one warning per child.
    {
      const r = render('zone z at 0,0 w 3 h 2 "Z"\n'
        + 'box a "A" at z.left+0.5,z.cy\nbox b "B" at z.left+1.2,z.cy');
      const zoneWarn = r.warns.filter(w => /\bz\b/.test(w) && /overlap/.test(w));
      ok(zoneWarn.length === 0, 'a box standing in a zone is not a collision', zoneWarn.join(' | '));
    }
    // And a box that fully contains another is not one either – nesting is
    // deliberate, and it was a warning per panel before.
    {
      const r = render('box outer "" at 0,0 w 4 h 3 {.clear}\nbox inner "I" at 0,0 w 1 h 0.6');
      const held = r.warns.filter(w => /overlap/.test(w));
      ok(held.length === 0, 'nor is a box that fully contains another', held.join(' | '));
    }
  }

  // ── a warning says where the element it names was written ─────────
  // Half the names in this grammar are generated, so the one move a reader
  // has – search the block for the name the message used – finds nothing.
  // Measured on a real keynote: `edge edge-4 runs 0.5° off the axis` against
  // fourteen figures and about thirty edges, not one of them named. Every
  // warning that names an element carries `dgSite(el)` now.
  //
  // The assertion is about the *site* and never about the rest of the
  // wording: the messages themselves are the business of the checks above.
  {
    const sited = (what, body, head = '') => {
      const r = render(body, head);
      if (!r.ok) { ok(false, `${what} compiles`, r.msg.split('\n')[0]); return []; }
      return r.warns;
    };
    const cases = [
      ['a skewed edge', 'box a "A" at 0,0 w 1 h 0.5\nbox b "B" at 2,0.02 w 1 h 0.5\nedge a -> b', true, ''],
      ['a label a side cannot move', 'box a "A" at 0,0\nbox b "B" right of a gap 2\n'
        + 'edge a -> b "x" side left', true, ''],
      ['a clipped label', 'box src "Sender"\nbox mix "Mix" right of src gap 1.05\n'
        + 'edge src -> mix "encrypted"', true, 'unit=126x38'],
      ['two boxes on one piece of paper', 'box a "A" at 0,0 w 2 h 1\nbox b "B" at 0.9,0.3 w 2 h 1', false, ''],
      ['a box narrower than its label', 'box a "A very long label indeed" at 0,0 w 0.4', false, ''],
      ['a class clash', 'box a "A" at 0,0 {.tone-4 .accent}', false, ''],
    ];
    for (const [what, body, isEdge, head] of cases) {
      const ws = sited(what, body, head);
      ok(ws.length === 1, `${what} draws exactly one warning`, `${ws.length} warning(s)`);
      const w = ws[0] || '';
      ok(/line \d+ of the block/.test(w), `${what}: the warning says which line wrote it`, w);
      if (isEdge) {
        ok(/\(\S+ (->|--|<->) \S+, line \d+ of the block\)/.test(w),
          `${what}: and names the two ends it joins`, w);
      }
    }
    // A generated edge has no endpoint tokens of its own, so the fallback has
    // to name the two actors rather than the two lifeline coordinates the
    // expansion built it from – `a point -> a point` names nothing at all.
    {
      const r = render('sequence s at 0,0\n  actor u "U"\n  actor r "R"\n'
        + '  u -> r "m" side left');
      const w = r.ok ? r.warns.find(x => /edge s-0/.test(x)) : null;
      ok(!!w && /\(u -> r, line 4 of the block\)/.test(w),
        'a sequence message names its two actors, not two points', w || '(no warning)');
    }
  }

  note('four contracts, and this gate holds the third: what the compiler emitted, '
    + 'not whether it parsed');

  // ── the editor writes back what the tokenizer reads ─────────────────
  // dgeQuote is dgTokenize's inverse, and the property is worth one
  // assertion rather than a table of pairs: whatever the panel holds, the
  // source it writes has to tokenize back to exactly that. It did not, and
  // the failures were silent - a value ending in a backslash wrote a source
  // line whose closing quote was escaped, so the rest of the line was
  // swallowed with no compile error at all.
  //
  // Read as text because editor.mjs is a classic script spliced into the
  // page, so there is nothing to import; the same reason settings.mjs lifts
  // splitSentencesIn out of a built audience.html.
  {
    const src = fs.readFileSync(path.join(ROOT, 'editor.mjs'), 'utf8');
    const m = src.match(/function dgeQuote\(v\) \{[\s\S]*?\n\}/);
    ok(!!m, 'dgeQuote is findable in editor.mjs');
    const dgeQuote = new Function('return ' + m[0])();
    const awkward = [
      'plain', 'a"b', 'two\nlines', 'C:\\', 'C:\\new', 'a\\"b', 'a\\tb',
      '\\', 'a\\\\b', 'scan\\_page', 'ends with "', '"', '\\n',
    ];
    for (const v of awkward) {
      const t = dgTokenize('"' + dgeQuote(v) + '"');
      ok(t.length === 1 && t[0].v === v,
         `dgeQuote/dgTokenize round-trip: ${JSON.stringify(v)}`,
         t.length === 1 ? JSON.stringify(t[0].v) : `split into ${t.length} tokens`);
    }
    // The three the tokenizer owns, and nothing else decoded.
    ok(dgTokenize('"a\\_b"')[0].v === 'a\\_b', 'a marker escape is handed on whole, for dgSpans to read');
    ok(dgTokenize('"a\\|b"')[0].v === 'a\\|b', 'and so is a pipe, which a table row splits on');
  }
}
