#!/usr/bin/env node
/*
 * node test/gates/run.mjs             all gates
 * node test/gates/run.mjs corpus      only the gates whose name contains "corpus"
 *
 * The fast half of the suite: everything about the figure language that can be
 * decided without a browser. It compiles diagram source through
 * `diagram-core.mjs`, runs the same source through `lint.js`, and asserts the
 * two agree – in seconds, on a bare checkout, with no `npm install` and no
 * Chromium, because both of those files are zero-dependency by design.
 *
 * Six gates, and they prove six different things – which is worth stating
 * because a green run summarised as one number hid a wrong drawing behind a
 * passing parse:
 *
 *   refusals   build and lint agree on what is refused, and on what is not
 *   accepts    every construct the grammar offers still parses
 *   semantics  the emitted SVG means what the source says, and what the
 *              source means to the editor that rewrites it
 *   corpus     every block in the repository still compiles
 *   step-classes  which classes a beat can actually carry, derived from the
 *              compiler's own table rather than restated
 *   inlined    the two characters that mean something else inside one of
 *              build.js's template literals: a raw backtick, which ends the
 *              literal, and a single-backslash regex escape, which the
 *              literal eats and which therefore ships
 *
 * `test/run.mjs` is the other half and stays separate: it builds and serves
 * the lectures, launches a browser and takes about four minutes. Splitting
 * them is the point. These gates are cheap enough to run on every push, which
 * is what the browser suite can never be, and they cover the one thing CI
 * could not see before – the hand-mirrored parsing contract in `lint.js`
 * drifting from the compiler it mirrors.
 */
import { createReport } from './harness.mjs';

const GATES = [
  './refusals.mjs',
  './accepts.mjs',
  './semantics.mjs',
  './corpus.mjs',
  './step-classes.mjs',
  './inlined.mjs',
];

const filter = process.argv.slice(2).filter(a => !a.startsWith('-'));
const gates = [];
for (const path of GATES) {
  const mod = await import(path);
  if (!filter.length || filter.some(f => mod.name.includes(f) || path.includes(f))) gates.push(mod);
}
if (!gates.length) {
  console.error('no gate matched ' + JSON.stringify(filter));
  process.exit(2);
}

const report = createReport();
const t0 = Date.now();
let crashed = 0;

for (const gate of gates) {
  console.log('\n' + gate.name);
  try {
    await gate.run({ report });
  } catch (e) {
    crashed++;
    console.log('  ✗ gate threw: ' + (e && e.stack ? e.stack : e));
  }
}

const failed = report.failures.length + crashed;
console.log(`\n${report.passed} passed, ${failed} failed, ${report.pending} pending, `
  + `${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (report.failures.length) {
  console.log(report.failures.map(f => '  ✗ ' + f).join('\n'));
}
process.exit(failed ? 1 : 0);
