#!/usr/bin/env node
/*
 * node test/run.mjs            all specs
 * node test/run.mjs nav        only the specs whose name contains "nav"
 *
 * Builds the lectures the specs name, serves them on loopback, and drives
 * them in a headless Chromium. Needs a browser: $PSI_CHROME wins, then one in
 * the Playwright cache, then the system Google Chrome.
 *
 * This is not a unit-test suite and does not try to be one. It covers the
 * three things in this project that can only break in a built page - the
 * navigation model, the editor's treatment of an edge, and the waypoint
 * round-trip - and it exists because each of those is a place where a
 * regression is silent until somebody is teaching with it. Everything else is
 * still guarded by `node lint.js lectures/` and by the build's own hard
 * failures, which is the right split: a check that can run without a browser
 * should.
 */
import { buildLecture, serve, openDeck, editorHelpers, createReport, ROOT } from './harness.mjs';

const SPECS = [
  './nav.mjs',
  './nav-cockpit.mjs',
  './editor-edges.mjs',
  './editor-waypoints.mjs',
  './editor-leaders.mjs',
  './editor-align.mjs',
  './editor-sidebar.mjs',
  './editor-placement.mjs',
  './editor-dock.mjs',
  './editor-expanded.mjs',
  './editor-aim.mjs',
  './editor-steps.mjs',
  './figure-labels.mjs',
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
  } catch (e) {
    crashed++;
    console.log('  ✗ spec threw: ' + (e && e.message ? e.message : e));
  } finally {
    await deck.browser.close();
  }
}

for (const { server } of servers.values()) server.close();

const failed = report.failures.length + crashed;
console.log(`\n${report.passed} passed, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (report.failures.length) {
  console.log(report.failures.map(f => '  ✗ ' + f).join('\n'));
}
process.exit(failed ? 1 : 0);
