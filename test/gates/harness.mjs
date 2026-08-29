/*
 * The bits every fast gate needs: a diagram compiler with the four Node-only
 * leaves stubbed out, a bridge that runs the same source through `lint.js`,
 * and the report helper.
 *
 * Why these gates exist at all, and why they are not in `test/run.mjs`. The
 * browser suite covers the things that only break in a built page and takes
 * about four minutes to say so. Everything the *compiler* decides – which
 * lines it refuses, which it accepts, what it says when it refuses – is
 * reachable from Node in milliseconds, and CLAUDE.md names the failure these
 * gates guard: `lint.js` deliberately mirrors the parsing contract by hand,
 * and a linter laxer than the build merges green and fails every later build.
 * CI lints two lectures it did not used to build, which is exactly where that
 * bites.
 *
 * Deliberately no test framework, and deliberately no browser: the whole
 * point of this entry point is that it needs neither. It also needs no
 * `npm install` – `diagram-core.mjs` and `lint.js` are both zero-dependency,
 * so these gates run on a bare checkout.
 *
 * The report helper is a copy of the one in `test/harness.mjs`, not an import
 * of it: that file loads `playwright-core` at module scope, and pulling a
 * browser binding into a gate whose selling point is that it needs no browser
 * would undo the thing being bought. Fifteen lines, same output shape.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createDiagramCompiler, createSpanTable } from '../../diagram-core.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── the compiler, with its four Node-only leaves stubbed ────────────
// `createDiagramCompiler` takes asset resolution, aspect reading, the warning
// sink and `escapeHtml` from its host. A gate has no assets, so `image` lines
// resolve to a raster of a stated proportion rather than failing – the corpus
// contains them and they are not what any of these gates is about. `abs` has
// to be truthy for `imageAspect` to be consulted at all, or every image line
// in the corpus answers with "cannot read the asset's proportions" and the
// warning census measures the stub rather than the source.
export function makeCore() {
  const warns = [];
  const core = createDiagramCompiler({
    resolveImage: (ref) => ({ kind: 'raster', href: ref, path: ref, markup: '', abs: ref }),
    imageAspect: () => 1.6,
    warn: (m) => warns.push(m),
    escapeHtml: (s = '') => String(s),
    assetMarkup: () => '',
    resetAssets: () => {},
  });
  return { core, warns };
}

/**
 * Compile one diagram body. Returns `{ ok, out, print, warns }` on success and
 * `{ ok: false, msg, warns }` on a refusal. `print` is the emitted SVG without
 * the per-beat payload, which is what a view with no JavaScript shows.
 */
export function render(body, headAttrs = '') {
  const { core, warns } = makeCore();
  try {
    const out = core.renderDiagram(body, headAttrs, {});
    return { ok: true, out, print: out.split('<script')[0], warns };
  } catch (e) {
    return { ok: false, msg: String(e && e.message || e), warns };
  }
}

/**
 * The span table the editor rewrites a block through, for one body. It is not
 * a drawing, so nothing here reads it back out of an SVG – but it is decided
 * by the compiler alone, which is what makes it a gate rather than a browser
 * spec.
 */
export function spans(body) {
  const { core } = makeCore();
  const { model } = core.parseDiagramSource(body, '');
  return createSpanTable(model, body);
}

/** The per-beat payload a stepped figure carries, as parsed JSON, or null. */
export function frames(out) {
  const m = out.match(/<script[^>]*class="psi-diagram-frames"[^>]*>([\s\S]*?)<\/script>/);
  if (m) { try { return JSON.parse(m[1]); } catch (e) { return null; } }
  return null;
}

// ── the lint side ───────────────────────────────────────────────────
// `lint.js` is a program, not a module: it has no exported entry point and is
// zero-dependency on purpose. So the only honest way to ask it what it thinks
// of a line is to hand it a lecture and read what it prints.

/**
 * Run a set of diagram bodies through `lint.js` in one invocation and bucket
 * the findings back onto the body that produced them.
 *
 * One temporary directory under the OS temp dir, removed again whatever
 * happens – the scratch version wrote into a session directory that only
 * existed on one machine, which is half of why these gates were not
 * rerunnable.
 *
 * @param {{name: string, body: string}[]} cases
 * @returns {{line: number, sev: string, rule: string, msg: string}[][]}
 *   one array of findings per case, in the same order
 */
export function lintAll(cases) {
  const out = ['---', 'title: gate fixtures', 'author: gate', '---', ''];
  const spans = [];
  cases.forEach((c, i) => {
    // A `figure:` chunk has no word budget, so nothing but the diagram itself
    // can produce a finding inside the span this gate reads.
    out.push(`## figure: Fixture ${i} {#fx-${i}}`, '', '::: draw');
    const start = out.length + 1;              // 1-based line of the first body line
    for (const l of c.body.split('\n')) out.push(l);
    spans.push([start, out.length]);
    out.push(':::', '');
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psi-gate-'));
  let raw = '';
  try {
    const file = path.join(dir, 'source.md');
    fs.writeFileSync(file, out.join('\n'));
    try {
      raw = execFileSync(process.execPath, [path.join(ROOT, 'lint.js'), file],
        { encoding: 'utf8', maxBuffer: 1 << 26 });
    } catch (e) {
      // A lecture with errors exits 1, which execFileSync throws on. The
      // findings are on stdout either way; only a crash has none.
      raw = e.stdout || '';
      if (!raw) throw e;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const findings = raw.split('\n').map((l) => {
    const m = l.match(/^.*?:(\d+)\s+(error|warn)\s+(\S+)\s+(.*)$/);
    return m ? { line: +m[1], sev: m[2], rule: m[3], msg: m[4] } : null;
  }).filter(Boolean);
  return spans.map(([s, e]) => findings.filter(f => f.line >= s && f.line <= e));
}

// ── reporting ───────────────────────────────────────────────────────
// Same shape as test/harness.mjs, plus one counter. A `pending` entry is a
// known defect with a written reason: it does not fail the run, but the day
// it starts behaving it *does*, so the ledger cannot rot into a list of
// things that were fixed years ago and nobody dared delete.
export function createReport() {
  const failures = [];
  let passed = 0, pending = 0;
  return {
    ok(cond, what, got) {
      if (cond) { passed++; console.log('  ✓ ' + what); return true; }
      failures.push(what);
      console.log('  ✗ ' + what + (got === undefined ? '' : '\n      got: ' + got));
      return false;
    },
    /**
     * `cond` is the assertion as it should read once the defect is fixed.
     * While it is false this is a pending entry; the moment it is true the
     * entry is stale and the run fails so somebody removes it.
     */
    pendingOk(cond, what, why) {
      if (!cond) { pending++; console.log('  ~ ' + what + '\n      pending: ' + why); return false; }
      failures.push(what + ' – now passes; remove it from the pending ledger');
      console.log('  ✗ ' + what + '\n      this is on the pending ledger but now passes – remove it');
      return true;
    },
    note(line) { console.log('    ' + line); },
    get passed() { return passed; },
    get pending() { return pending; },
    get failures() { return failures; },
  };
}
