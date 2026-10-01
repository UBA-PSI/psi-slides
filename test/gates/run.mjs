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
 * Twenty-one gates, and they prove twenty-one different things – which is
 * worth stating because a green run summarised as one number hid a wrong
 * drawing behind a passing parse:
 *
 *   refusals   build and lint agree on what is refused, and on what is not
 *   accepts    every construct the grammar offers still parses
 *   semantics  the emitted SVG means what the source says, and what the
 *              source means to the editor that rewrites it
 *   corpus     every block in the repository still compiles, and each file
 *              holds exactly the number of blocks it is said to
 *   step-classes  which classes a beat can actually carry, derived from the
 *              compiler's own table rather than restated
 *   inlined    the two characters that mean something else inside one of
 *              build.js's template literals: a raw backtick, which ends the
 *              literal, and a single-backslash regex escape, which the
 *              literal eats and which therefore ships
 *   tails      the one {…} tail parser and the ::: draw opener parser in
 *              tails.mjs: every code they can emit, the written-default rule,
 *              and the formatter round trip
 *   frontmatter  the top-level key set, held across build.js and lint.js in
 *              the direction that matters: a key the build reads and the
 *              linter does not know is a false warning on a valid deck
 *   legacy-draw-syntax  the old braced ::: draw opener stays out of every
 *              source.md, and every other survivor of it is on a reviewed
 *              allowlist
 *   cue-cards  the note-to-cards grammar in cue-cards.mjs, rule by rule,
 *              and that the module reaches the speaker page as
 *              window.PSI_CARDS with every export on it
 *   souffleuse the live prompter's pure half in souffleuse.mjs: the deck
 *              payload, the prompt, the answer, the drift arithmetic and
 *              every row of the restraint policy - the requirement nobody
 *              can check by watching one talk
 *   image-refs every way a source.md names a picture, and the one collector
 *              both readers go through - the set that decides what the inline
 *              cap refuses and what --optimize-images can fix
 *   xheight    every text face in BUNDLED_FONTS carries the measured
 *              x-height that sizes inline code against the prose around
 *              it, and the roster agrees with the JSON it was copied from
 *   canvas     the three measured numbers behind a figure's canvas - the
 *              per-type body em, the default zoom, and the one spelling of
 *              a frame in two files that cannot import one another - plus
 *              the one sentence shape the two canvas reports say an axis in
 *   chains     peers share one size: which placements make two boxes peers,
 *              which axis each shares, the two ways out, `row` / `col`,
 *              `same w as` / `same h as`, and the two warnings for a written
 *              size that cannot hold its own words
 *   overlap    the overlap census measures ink and not the line box: a text
 *              is compared as the rectangles it inks, one per line
 *   untrusted  building a source.md somebody sent you: the frontmatter is
 *              YAML only, an asset is read from the lecture's folder or the
 *              one above it (not when that is home) and never from a
 *              dot-folder, links resolved, an output never
 *              writes through a link, and ImageMagick is told the decoder
 *   pdf-core   the PDF export's policy without a browser: the order in which
 *              a driver is asked for anything (network refused before load,
 *              auto-fit and collapse before the walk, print DOM before the
 *              pdf), the option checks in the words build.js always used,
 *              and the report's lines
 *   id-namespace  every id the build writes or looks up by literal starts
 *              with psiINT-, or is on a reviewed list of sites that emit the
 *              author's own ids or build one from a psiINT- prefix
 *   commands   the command table in commands.mjs: every press the old key
 *              map answered still means what it meant, every command has a
 *              run function where it is answered, and every key the live
 *              views answer has a row in their ? panel - the panel rendered,
 *              and a reviewed list of the keys answered without one
 *   editor     the editor's acts that rewrite a figure's source - rename,
 *              delete, duplicate, copy and paste, a step's ops, a resize,
 *              the reader's shelf - driven in a vm with diagram-core as
 *              window.PSI_DG and a DOM that is never there
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
  './tails.mjs',
  './frontmatter.mjs',
  './legacy-draw-syntax.mjs',
  './cue-cards.mjs',
  './souffleuse.mjs',
  './xheight.mjs',
  './image-refs.mjs',
  './canvas.mjs',
  './chains.mjs',
  './overlap.mjs',
  './untrusted.mjs',
  './pdf-core.mjs',
  './id-namespace.mjs',
  './commands.mjs',
  './editor.mjs',
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
