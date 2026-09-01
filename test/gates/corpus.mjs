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

export const name = 'every corpus figure compiles';

const FILES = [
  'lectures/diagrams/source.md',
  'lectures/network-security/source.md',
  'docs/artifact/figure-rules/source.md',
  // Six compiled blocks, four tracked views, published by the Pages job. Left
  // out of a corpus census it is invisible.
  'lectures/tutorial/source.md',
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
// block inside a code fence is a syntax example and must not be compiled.
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
      const m = ln.match(/^:::\s+draw\s*(?:\{([^}]*)\})?\s*$/);
      if (m) cur = { head: m[1] || '', body: [], line: i + 1 };
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

  for (const rel of FILES) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const found = blocks(src);
    for (const b of found) {
      n++;
      const { core, warns } = makeCore();
      const where = `${rel}:${b.line}`;
      try {
        core.renderDiagram(b.body.join('\n'), b.head, {});
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
