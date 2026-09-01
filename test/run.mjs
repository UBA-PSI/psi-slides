#!/usr/bin/env node
/*
 * node test/run.mjs            all specs
 * node test/run.mjs nav        only the specs whose name contains "nav"
 *
 * Builds the lectures the specs name, serves them on loopback, and drives
 * them in a headless Chromium. Needs a browser: $PSI_CHROME wins, then one in
 * the Playwright cache, then the system Google Chrome.
 *
 * This is not a unit-test suite and does not try to be one. It covers what
 * can only break in a built page, in four families - the navigation model,
 * the editor's gestures and panel, the geometry of an emitted figure, and the
 * settings that only show up in a rendered view - and it exists because each
 * of those is a place where a regression is silent until somebody is teaching
 * with it. It said "three things" for as long as it had three specs.
 * Everything else is still guarded by `node lint.js lectures/`, by
 * `test/gates/`, and by the build's own hard failures, which is the right
 * split: a check that can run without a browser should.
 */
import { buildLecture, serve, openDeck, closeBrowser, editorHelpers, createReport, ROOT } from './harness.mjs';

const SPECS = [
  './nav.mjs',
  './auto-fit.mjs',
  './nav-cockpit.mjs',
  './expansion.mjs',
  './marginalia.mjs',
  './touch-rail.mjs',
  './text-select.mjs',
  './math-focus.mjs',
  './block-align.mjs',
  './side-anchor.mjs',
  './cards.mjs',
  './squint.mjs',
  './editor-edges.mjs',
  './editor-waypoints.mjs',
  './editor-leaders.mjs',
  './editor-align.mjs',
  './editor-sidebar.mjs',
  './editor-placement.mjs',
  './editor-dock.mjs',
  './editor-guides.mjs',
  './editor-drag-guides.mjs',
  './editor-drag-guides-network.mjs',
  './editor-series.mjs',
  './editor-expanded.mjs',
  './editor-aim.mjs',
  './editor-steps.mjs',
  './editor-sequence.mjs',
  './figure-labels.mjs',
  './figure-prominence.mjs',
  './figure-sequence.mjs',
  './figure-framing.mjs',
  './figure-framing-network.mjs',
];

const filter = process.argv.slice(2).filter(a => !a.startsWith('-'));
const specs = [];
for (const path of SPECS) {
  const mod = await import(path);
  if (!filter.length || filter.some(f => mod.name.includes(f))) specs.push(mod);
}
if (!specs.length) {
  console.error('no spec matched ' + JSON.stringify(filter));
  process.exit(2);
}

// One build per lecture, however many specs use it.
const dirs = new Map();
for (const s of specs) {
  if (!dirs.has(s.lecture)) dirs.set(s.lecture, buildLecture(s.lecture));
}
const servers = new Map();
for (const [slug, dir] of dirs) servers.set(slug, await serve(dir));

const report = createReport();
const t0 = Date.now();
let crashed = 0;

for (const spec of specs) {
  console.log('\n' + spec.name);
  const { port } = servers.get(spec.lecture);
  const deck = await openDeck(port, spec.view || 'audience');
  try {
    await spec.run({ ...deck, report, ed: editorHelpers(deck.page) });
    // Every spec used to end with this line, which meant one spec could
    // forget it – `figure-prominence.mjs` did, and swallowed page errors for
    // as long as it existed. It is an invariant of running a spec at all, so
    // the runner owns it and no new spec can be written without it.
    report.ok(deck.errors.length === 0, 'no page errors', deck.errors.join(' | '));
  } catch (e) {
    crashed++;
    console.log('  ✗ spec threw: ' + (e && e.message ? e.message : e)
      + (deck.errors.length ? '\n      page errors: ' + deck.errors.join(' | ') : ''));
  } finally {
    await deck.close();
  }
}

await closeBrowser();
for (const { server } of servers.values()) server.close();

const failed = report.failures.length + crashed;
console.log(`\n${report.passed} passed, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (report.failures.length) {
  console.log(report.failures.map(f => '  ✗ ' + f).join('\n'));
}
process.exit(failed ? 1 : 0);
