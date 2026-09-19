/*
 * Every `::: draw` block in the repository still compiles.
 *
 * The four sources below hold every figure the project has: the construct
 * reference, thirty-six real lecture slides, the lecture the standalone
 * teaching page is compiled from, and the tutorial. Between them they are the
 * only body of figures written by hand rather than for a test, which makes
 * them the only thing that can catch a refusal that is *too strict* at scale.
 *
 * Two things this deliberately does not do.
 *
 * It does not snapshot the emitted SVG. The scratch version did, against a
 * committed 620 KB baseline, and that was the right tool for one migration and
 * the wrong one to keep: the baseline churns whenever a layout constant moves,
 * it cannot tell an improvement from a regression, and text width here is
 * *estimated* rather than measured, so the numbers in it are not the numbers a
 * browser paints anyway. The properties a snapshot was standing in for are
 * asserted directly, from a real browser with real metrics, by
 * `test/figure-framing.mjs`, `test/figure-labels.mjs` and
 * `test/figure-sequence.mjs`.
 *
 * It does not build the lectures. `node build.js` on all six is the CI step
 * next to this one and it costs minutes; this costs milliseconds because it
 * goes straight to the compiler. The two are complementary – the build catches
 * things no compiler gate can, such as a backtick landing inside one of
 * build.js's template literals.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeCore, ROOT } from './harness.mjs';
import { parseDrawOpener, drawCompilerAttrs } from '../../tails.mjs';
import { parseDiagramDefaults } from '../../diagram-core.mjs';

export const name = 'every corpus figure compiles';

// Each with the number of blocks it holds, asserted exactly: a census that
// counts whatever it finds passes vacuously the day the opener grammar moves
// and the extractor matches nothing. When a lecture gains or loses a figure,
// the number changes in the same commit.
const FILES = [
  ['lectures/diagrams/source.md', 31],
  ['lectures/network-security/source.md', 36],
  ['docs/artifact/figure-rules/source.md', 55],
  // Ten compiled blocks (an eleventh opener sits in a code fence as a syntax
  // example), four tracked views, published by the Pages job.
  // Left out of a corpus census it is invisible.
  ['lectures/tutorial/source.md', 11],
  ['lectures/decoration/source.md', 5],
  // The site's example lecture has no figure today; the zero is the ratchet
  // that notices the day it gets one.
  ['docs/site/example/source.md', 0],
];

// A ratchet, not a snapshot. Three of the warnings below are deliberate – the
// construct reference draws a box too narrow for its label on purpose, and the
// figure-rules lecture carries two edges a degree and a half off the axis – so
// the number is here to say "no *new* kind of complaint appeared", and it is
// one line to raise when a figure earns one. Each warning is printed, so a
// failure names itself. (The two decks were named the other way round here for
// as long as nobody read the printout beside the ceiling.)
//
// It was briefly 5. The label-clearance check found its first defect on the
// first source it was run against - `lectures/tutorial` `#diagram` put the
// words `encrypted` and `recoded` between boxes 40 px apart, and they measure
// 71 and 57, so the boxes at either end clipped both. The figure was redrawn
// at `gap 2.1` in the same session, so the ceiling never had to hold a known
// defect open. Raise it for a warning a figure has earned, not for one it has.
const WARNING_CEILING = 3;

// Extract `::: draw` blocks the way lint.js does: fence-aware, because a
// block inside a code fence is a syntax example and must not be compiled,
// and through the shared opener parser. A refused opener is still a block -
// it is recorded with its problems rather than dropped, or a stale spelling
// would silently shrink the corpus.
// **Each lecture's figures compile the way that lecture compiles them.** A
// block is not the whole input: `draw-defaults` in the frontmatter is a layer
// under every figure in the deck, and an `image` line's box comes from the
// asset's own proportions. Compiled without either, a figure here is a figure
// no reader has ever seen – `lectures/network-security` sets `default text
// {.small}`, so every label in it was measured a quarter too large, and
// `lectures/diagrams`' avatars are 100x120 against a stub's 1.6, so they stood
// a third too tall. Both produced overlap warnings about geometry the build
// does not draw, which is exactly the kind of noise a ratchet must not carry.
export function defaultsOf(src) {
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  const m = fm && fm[1].match(/^draw-defaults:\s*\|\s*\n((?:[ \t]+.*\n?)*)/m);
  if (!m) return null;
  const { layer } = parseDiagramDefaults(m[1].replace(/^[ \t]{2}/gm, ''));
  return layer;
}

// An SVG says its proportions in its viewBox, and every `image` in the corpus
// but one is an SVG. The odd one out (a 282-byte PNG swatch) keeps the stub's
// answer: reading a raster header is `imageSize()` in build.js, which a gate
// that runs without `npm install` has no business importing.
export function aspectReader(dir) {
  return (ref) => {
    for (const ext of ['.svg']) {
      const p = path.join(dir, 'assets', ref + ext);
      if (!fs.existsSync(p)) continue;
      const vb = fs.readFileSync(p, 'utf8').match(/viewBox="([\d.\s-]+)"/);
      if (!vb) break;
      const n = vb[1].trim().split(/\s+/).map(Number);
      if (n.length === 4 && n[2] > 0) return n[3] / n[2];
    }
    return 1.6;
  };
}

export function blocks(src) {
  const lines = src.split('\n');
  const out = [];
  let fence = null, cur = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const fm = ln.match(/^\s*(```+|~~~+)/);
    if (fm) {
      if (!fence) fence = fm[1][0];
      else if (ln.trim().startsWith(fence)) fence = null;
      if (!cur) continue;
    }
    if (fence) { if (cur) cur.body.push(ln); continue; }
    if (!cur) {
      const o = parseDrawOpener(ln);
      if (o) cur = { head: drawCompilerAttrs(o), problems: o.problems, body: [], line: i + 1 };
    } else if (/^:::\s*$/.test(ln)) { out.push(cur); cur = null; }
    else cur.body.push(ln);
  }
  return out;
}

export async function run({ report }) {
  const { ok, note } = report;
  const failures = [];
  const warnings = [];
  let n = 0;

  for (const [rel, expected] of FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const found = blocks(src);
    const base = defaultsOf(src);
    const imageAspect = aspectReader(path.dirname(path.join(ROOT, rel)));
    ok(found.length === expected, `${rel} holds ${expected} block(s)`, `found ${found.length}`);
    for (const b of found) {
      n++;
      const { core, warns } = makeCore({ imageAspect });
      const where = `${rel}:${b.line}`;
      if (b.problems.length) {
        failures.push(`${where}\n      ${b.problems.map(p => p.msg).join('\n      ')}`);
        continue;
      }
      try {
        core.renderDiagram(b.body.join('\n'), b.head, base ? { base } : {});
        for (const w of warns) warnings.push(`${where}  ${w}`);
      } catch (e) {
        failures.push(`${where}\n      ${String(e.message).split('\n').slice(0, 4).join('\n      ')}`);
      }
    }
    note(`${rel.padEnd(40)} ${String(found.length).padStart(3)} block(s)`);
  }

  ok(failures.length === 0, `all ${n} corpus figures compile`, failures.join('\n      '));
  for (const w of warnings) note(w);
  ok(warnings.length <= WARNING_CEILING,
    `no more than ${WARNING_CEILING} compiler warning(s) across the corpus`,
    `${warnings.length} warning(s)`);
}
