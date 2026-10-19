#!/usr/bin/env node
/*
 * node test/run.mjs            all specs
 * node test/run.mjs nav        only the specs whose name contains "nav"
 * node test/run.mjs --jobs 1   one spec at a time, in this process, as before
 *
 * By default half the cores' worth of specs (at most six) run at once, each in
 * a child process of its own with its own Chromium; a spec that exports
 * `serial = true` runs afterwards, alone. A filter that leaves one spec, or
 * only serial ones, runs them in this process as --jobs 1 does.
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
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildLecture, buildLectureAsync, serve, openDeck, closeBrowser, editorHelpers, createReport, ROOT } from './harness.mjs';

const SPECS = [
  './nav.mjs',
  './auto-fit.mjs',
  './nav-cockpit.mjs',
  './nav-goto.mjs',
  './help-search.mjs',
  './palette.mjs',
  './nav-fullscreen.mjs',
  './cue-cards.mjs',
  './cockpit-notes.mjs',
  './local-edits.mjs',
  './cockpit-alone.mjs',
  './watch-resume.mjs',
  './clock.mjs',
  './timer.mjs',
  './souffleuse.mjs',
  './demo.mjs',
  './live-trust.mjs',
  './expansion.mjs',
  './marginalia.mjs',
  './annotation.mjs',
  './touch-rail.mjs',
  './text-select.mjs',
  './math-focus.mjs',
  './block-align.mjs',
  './code-fit.mjs',
  './side-anchor.mjs',
  './cards.mjs',
  './beats-nested.mjs',
  './beats-footnote.mjs',
  './dock.mjs',
  './autoplay.mjs',
  './live-sync.mjs',
  './camera-fit.mjs',
  './transition.mjs',
  './pitchblack.mjs',
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
  './figure-type.mjs',
  './bleed.mjs',
  './figure-labels.mjs',
  './figure-prominence.mjs',
  './figure-sequence.mjs',
  './figure-framing.mjs',
  './figure-framing-network.mjs',
  './figure-dotted.mjs',
  './reader.mjs',
  './document.mjs',
];

// ── the command line ────────────────────────────────────────────────
// `--jobs N` (or `-j N`, `--jobs=N`) is how many specs run at once; the rest
// of the arguments that do not start with a dash filter by name, as always.
// `--child` and `--port` are the runner talking to itself (see below).
const argv = process.argv.slice(2);
const filter = [];
let jobsArg = null, childSpec = null, childPort = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--jobs' || a === '-j') jobsArg = argv[++i];
  else if (a.startsWith('--jobs=')) jobsArg = a.slice(7);
  else if (a === '--child') childSpec = argv[++i];
  else if (a === '--port') childPort = Number(argv[++i]);
  else if (!a.startsWith('-')) filter.push(a);
}
// Half the cores, at most six: each spec is a browser plus, for a fixture
// spec, a build, and past six on a twelve-core machine the specs that
// measure a moving camera start to wait for the CPU instead of the page.
const jobs = jobsArg === null
  ? Math.max(1, Math.min(6, Math.floor(os.availableParallelism() / 2)))
  : Number(jobsArg);
if (!Number.isInteger(jobs) || jobs < 1) {
  console.error('--jobs takes a whole number of at least 1, got ' + JSON.stringify(jobsArg));
  process.exit(2);
}

// One spec, one deck, one context. The same function runs a spec in this
// process (--jobs 1, and the serial specs) and in a child (everything else),
// so a spec cannot behave differently depending on where it ran.
async function runSpec(spec, port, report) {
  const deck = await openDeck(port, spec.view || 'audience');
  try {
    await spec.run({ ...deck, report, ed: editorHelpers(deck.page) });
    // Every spec used to end with this line, which meant one spec could
    // forget it – `figure-prominence.mjs` did, and swallowed page errors for
    // as long as it existed. It is an invariant of running a spec at all, so
    // the runner owns it and no new spec can be written without it.
    report.ok(deck.errors.length === 0, 'no page errors', deck.errors.join(' | '));
    return 0;
  } catch (e) {
    console.log('  ✗ spec threw: ' + (e && e.message ? e.message : e)
      + (deck.errors.length ? '\n      page errors: ' + deck.errors.join(' | ') : ''));
    return 1;
  } finally {
    await deck.close();
  }
}

// ── a child: one spec, its output on stdout, its tally on the last line ──
// A child process per spec, not a promise per spec in this one. Half the
// specs build a fixture deck with spawnSync, which would stall every other
// spec's page in a shared event loop; a spec's console.log would interleave
// with its neighbours'; and tmp.mjs cleans up on process exit, which is the
// right lifetime only if the process is the spec's.
const RESULT = '@@psi-spec-result ';
if (childSpec) {
  const spec = await import(childSpec);
  const report = createReport();
  let crashed = 1;
  try { crashed = await runSpec(spec, childPort, report); }
  finally { await closeBrowser(); }
  console.log(RESULT + JSON.stringify({ passed: report.passed, failures: report.failures, crashed }));
  process.exit(0);
}

const loaded = [];
for (const path of SPECS) {
  const mod = await import(path);
  if (!filter.length || filter.some(f => mod.name.includes(f))) loaded.push({ path, mod });
}
if (!loaded.length) {
  console.error('no spec matched ' + JSON.stringify(filter));
  process.exit(2);
}
const specs = loaded.map(l => l.mod);

// One build per lecture, however many specs use it. The builds are in place
// and in three different folders, so they can run side by side.
const slugs = [...new Set(specs.map(s => s.lecture))];
const dirs = new Map(await Promise.all(slugs.map(async (slug) =>
  [slug, jobs > 1 ? await buildLectureAsync(slug) : buildLecture(slug)])));
const servers = new Map();
for (const [slug, dir] of dirs) servers.set(slug, await serve(dir));

const t0 = Date.now();

// `export const serial = true` keeps a spec out of the parallel batch: it
// runs afterwards, alone, in this process, exactly as under --jobs 1. The
// reasons are in each spec's own line; test/README.md has the list.
const parallel = jobs > 1 ? loaded.filter(l => !l.mod.serial) : [];
const inline = parallel.length > 1 ? loaded.filter(l => l.mod.serial) : loaded;
const pooled = parallel.length > 1 ? parallel : [];

const results = new Map();   // spec path -> { passed, failures, crashed }

// ── the parallel batch ──────────────────────────────────────────────
// Each spec's output is held until it finishes and then printed whole, so
// two specs never interleave; the order is the order they finish in.
function runChild({ path: specPath, mod }) {
  const { port } = servers.get(mod.lecture);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath,
      [fileURLToPath(import.meta.url), '--child', specPath, '--port', String(port)],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    child.stdout.on('data', d => chunks.push(d));
    child.stderr.on('data', d => chunks.push(d));
    child.on('close', (code, signal) => {
      let out = Buffer.concat(chunks).toString('utf8');
      let result = null;
      const at = out.lastIndexOf(RESULT);
      if (at >= 0) {
        const end = out.indexOf('\n', at);
        try { result = JSON.parse(out.slice(at + RESULT.length, end < 0 ? undefined : end)); } catch { /* below */ }
        out = out.slice(0, at) + (end < 0 ? '' : out.slice(end + 1));
      }
      if (!result) {
        // It died before it could count: a browser that would not start, an
        // exception outside the spec, a signal. That is a crash, and the
        // output it did manage is the only evidence there is.
        out += `  ✗ spec process ended without a result (${signal || 'exit ' + code})\n`;
        result = { passed: 0, failures: [], crashed: 1 };
      }
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write('\n' + mod.name + `  (${secs}s)\n` + out.replace(/\n*$/, '\n'));
      results.set(specPath, result);
      resolve();
    });
  });
}
// Longest first, so the batch does not end on one long spec started last.
// Measured in a parallel run (seconds, one Apple M-series machine); a spec
// missing here just starts in SPECS order after these. Stale numbers cost
// only a little wall time, never a result.
const SLOW_FIRST = ['./palette.mjs', './reader.mjs', './cue-cards.mjs',
  './editor-drag-guides.mjs', './editor-drag-guides-network.mjs', './editor-sidebar.mjs',
  './figure-type.mjs', './nav.mjs', './editor-guides.mjs', './text-select.mjs'];
const rank = (p) => { const i = SLOW_FIRST.indexOf(p); return i < 0 ? SLOW_FIRST.length : i; };
const queue = [...pooled].sort((a, b) => rank(a.path) - rank(b.path));
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) await runChild(queue.shift());
}));

// ── in this process: everything under --jobs 1, the serial specs otherwise ──
const report = createReport();
for (const { path: specPath, mod: spec } of inline) {
  console.log('\n' + spec.name);
  const { port } = servers.get(spec.lecture);
  const before = { passed: report.passed, failed: report.failures.length };
  const started = Date.now();
  const crashed = await runSpec(spec, port, report);
  // Under --jobs 1 the output is what it always was; beside a parallel batch
  // the serial specs say how long they took, as the pooled ones do.
  if (pooled.length) console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s, alone)`);
  results.set(specPath, {
    passed: report.passed - before.passed,
    failures: report.failures.slice(before.failed),
    crashed,
  });
}

await closeBrowser();
for (const { server } of servers.values()) server.close();

// The tally in SPECS order, whichever order the specs finished in.
let passed = 0, crashed = 0;
const failures = [];
for (const { path: specPath } of loaded) {
  const r = results.get(specPath);
  passed += r.passed;
  crashed += r.crashed;
  failures.push(...r.failures);
}
const failed = failures.length + crashed;
console.log(`\n${passed} passed, ${failed} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failures.length) {
  console.log(failures.map(f => '  ✗ ' + f).join('\n'));
}
process.exit(failed ? 1 : 0);
