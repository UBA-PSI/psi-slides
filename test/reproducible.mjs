/*
 * A built view is the same bytes whichever flags produced it.
 *
 * `release.yml` fails when a tracked view on disk does not match a rebuild,
 * and three lectures track their views. That check is only meaningful if a
 * rebuild is a function of the source alone - and for a while it was not.
 * `inlineSvgCounter` numbers the id prefix of every inlined SVG and used to
 * reset once per *build* rather than once per view, so the same figure came
 * out `psi-fig-6-` under `--audience-only` and `psi-fig-8-` under a full
 * build. Content identical, bytes different: a contributor who iterated with
 * a partial flag and committed produced a diff of pure id churn and a view
 * that read as stale to CI.
 *
 * The obvious check does not catch this, which is why this file says so out
 * loud. Building twice with the SAME flags and comparing tests
 * reproducibility within a flag set, and that already passed while the
 * defect was live. The defect is a dependency ON the flag set, so the
 * comparison has to cross one.
 *
 * No browser and no `npm install` beyond what build.js already needs: it
 * builds a fixture deck into a temp dir, twice, and compares two files.
 */
import fs from 'node:fs';
import { tmpDir } from './tmp.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Standalone, like test/settings.mjs beside it, and NOT a test/gates/ entry
 * even though it is the kind of question gates answer. gates.yml runs on a
 * bare checkout with no `npm ci`, which is the property that suite exists to
 * have; this check spawns build.js, which needs the Markdown and Shiki stack.
 * A gate that cannot run in gates.yml is a gate nothing runs. So it lives
 * here and is wired where settings.mjs is wired: `npm test`, and release.yml
 * immediately before the staleness check it exists to make meaningful. */

// Two inlined SVGs and a ::: draw that splices one, because the floor the
// per-view counter starts from is whatever the parse minted for the
// diagrams - a fixture with no diagram would pass with the counter reset to
// zero and hide the collision that reset would cause.
const SOURCE = `---
title: T
---

## title: {#title}

## figure: One {#one}

![](fig-a)

## figure: Two {#two}

![](fig-b)
`;

const SVG = (hue) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">`
  + `<defs><linearGradient id="g"><stop offset="0" stop-color="hsl(${hue} 50% 50%)"/></linearGradient></defs>`
  + `<rect width="10" height="10" fill="url(#g)"/></svg>`;

let passed = 0; const failures = [];
const ok = (cond, what, detail = '') => {
  if (cond) { passed++; console.log('  \u2713 ' + what); return; }
  failures.push(what); console.log('  \u2717 ' + what + (detail ? '\n      ' + detail : ''));
};
const note = (line) => console.log('    ' + line);

{
  const dir = tmpDir('psi-repro-');
  fs.writeFileSync(path.join(dir, 'source.md'), SOURCE);
  // assets/, not beside source.md: the ![](id) shorthand resolves to
  // assets/<id>.<ext> and nowhere else. Written here because the first draft
  // of this fixture put them beside the source, inlined nothing at all, and
  // the check passed with zero figures to compare - green for the absence of
  // the thing it exists to measure. The build said `missing: assets/fig-a...`
  // in plain text at the time.
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'assets', 'fig-a.svg'), SVG(10));
  fs.writeFileSync(path.join(dir, 'assets', 'fig-b.svg'), SVG(200));

  const build = (...flags) => {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.html')) fs.unlinkSync(path.join(dir, f));
    const r = spawnSync(process.execPath, [path.join(ROOT, 'build.js'), path.join(dir, 'source.md'), ...flags],
      { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('build failed: ' + (r.stdout || '') + (r.stderr || ''));
    return fs.readFileSync(path.join(dir, 'audience.html'), 'utf8');
  };

  const full = build();
  // The fixture has to contain the thing under test, or every assertion
  // below passes by vacuity. This one line is why the check can go red.
  const n = (full.match(/\bid="psi-fig-\d+-root"/g) || []).length;
  ok(n === 2, 'the fixture inlined both of its SVGs', `${n} inlined`);

  ok(full === build(), 'a full build is reproducible: two runs, same bytes');

  const partial = build('--audience-only');
  const same = full === partial;
  if (!same) {
    const a = full.split('\n'), b = partial.split('\n');
    const diff = a.filter((l, i) => l !== b[i]);
    note(`${diff.length} line(s) differ; first: ${(diff[0] || '').slice(0, 90)}`);
  }
  ok(same, 'and --audience-only writes the same audience.html a full build does');

  // The property underneath it, stated directly so a failure says which half
  // broke: every id in one document is unique, whatever the floor was.
  const ids = [...full.matchAll(/\bid="(psi-fig-\d+-[^"]*)"/g)].map(m => m[1]);
  ok(ids.length === new Set(ids).size,
     'and every inlined-SVG id in the document is still unique',
     `${ids.length} ids, ${new Set(ids).size} distinct`);

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
